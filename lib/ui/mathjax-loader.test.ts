import test from 'node:test';
import assert from 'node:assert/strict';

function browserFixture() {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const scripts: Array<{ id: string; src: string; async: boolean; onload: () => void; onerror: () => void; remove: () => void }> = [];
  const target: { MathJax?: object } = {};
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({ remove() {} }),
    head: { appendChild(script: typeof scripts[number]) { scripts.push(script); } },
  } });
  return {
    scripts, target,
    restore() {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
      else Reflect.deleteProperty(globalThis, 'document');
    },
  };
}

let moduleId = 0;
async function freshLoader(): Promise<typeof import('./mathjax-loader.ts')> {
  return import(`./mathjax-loader.ts?test=${moduleId++}`);
}

test('concurrent renderers share one script and wait for MathJax startup', async () => {
  const fixture = browserFixture();
  try {
    const { loadMathJax } = await freshLoader();
    const first = loadMathJax();
    assert.equal(loadMathJax(), first);
    assert.equal(fixture.scripts.length, 1);
    const config = fixture.target.MathJax as { startup: { typeset: boolean }; chtml: { matchFontHeight: boolean; scale: number } };
    assert.equal(config.startup.typeset, false);
    assert.equal(config.chtml.matchFontHeight, false);
    assert.ok(config.chtml.scale > 1);
    let finishStartup!: () => void;
    let ready = false;
    const runtime = { startup: { promise: new Promise<void>((resolve) => { finishStartup = resolve; }) }, typesetPromise: async () => {} };
    fixture.target.MathJax = runtime;
    fixture.scripts[0].onload();
    void first.then(() => { ready = true; });
    await Promise.resolve();
    assert.equal(ready, false);
    finishStartup();
    assert.equal(await first, runtime);
  } finally { fixture.restore(); }
});

test('typesetting is serialized and cancelled or detached renders are skipped', async () => {
  const fixture = browserFixture();
  try {
    const { typesetMath } = await freshLoader();
    const rendered: Element[] = [];
    const cleared: Element[] = [];
    let active = 0;
    let maxActive = 0;
    fixture.target.MathJax = {
      typesetClear(elements: Element[]) { cleared.push(...elements); },
      async typesetPromise(elements: Element[]) {
        active++;
        maxActive = Math.max(active, maxActive);
        await new Promise((resolve) => setTimeout(resolve, 5));
        rendered.push(...elements);
        active--;
      },
    };
    const first = { isConnected: true } as Element;
    const second = { isConnected: true } as Element;
    await Promise.all([
      typesetMath(first, () => true), typesetMath(second, () => true),
      typesetMath({ isConnected: true } as Element, () => false),
      typesetMath({ isConnected: false } as Element, () => true),
    ]);
    assert.equal(maxActive, 1);
    assert.deepEqual(rendered, [first, second]);
    assert.deepEqual(cleared, [first, second]);
  } finally { fixture.restore(); }
});

test('a failed CDN download can be retried by a later render', async () => {
  const fixture = browserFixture();
  try {
    const { loadMathJax } = await freshLoader();
    const first = loadMathJax();
    fixture.scripts[0].onerror();
    await assert.rejects(first, /could not be loaded/);
    const retry = loadMathJax();
    assert.equal(fixture.scripts.length, 2);
    const runtime = { typesetPromise: async () => {} };
    fixture.target.MathJax = runtime;
    fixture.scripts[1].onload();
    assert.equal(await retry, runtime);
  } finally { fixture.restore(); }
});
