import { MATH_SCALE } from '../content/math-svg-units.ts';

interface MathJaxRuntime {
  startup?: { promise?: Promise<unknown> };
  typesetClear?: (elements: Element[]) => void;
  typesetPromise: (elements: Element[]) => Promise<unknown>;
}

const SCRIPT_ID = 'mathjax-script';
let loading: Promise<MathJaxRuntime> | null = null;
let typesetting: Promise<unknown> = Promise.resolve();

/** One download per browser session, only when a renderer finds raw math. */
export function loadMathJax(): Promise<MathJaxRuntime> {
  if (loading) return loading;
  loading = new Promise<MathJaxRuntime>((resolve, reject) => {
    const target = window as unknown as { MathJax?: MathJaxRuntime | object };
    const runtime = target.MathJax as MathJaxRuntime | undefined;
    if (runtime?.typesetPromise) {
      Promise.resolve(runtime.startup?.promise).then(() => resolve(runtime), reject);
      return;
    }
    // Preserve the former root-layout configuration. Pin the Inter scale and
    // disable the font-height probe (Safari zoom and font swap distort it).
    // Renderers own typesetting; never scan/mutate the whole React document.
    target.MathJax = {
      loader: { load: ['input/mml', 'input/tex', 'output/chtml'] },
      tex: { inlineMath: [['\\(', '\\)']], displayMath: [['\\[', '\\]'], ['$$', '$$']], processEscapes: true },
      chtml: { matchFontHeight: false, scale: MATH_SCALE },
      startup: { typeset: false },
    };
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
    script.async = true;
    const fail = () => {
      clearTimeout(timeout);
      script.remove();
      reject(new Error('MathJax could not be loaded'));
    };
    const timeout = setTimeout(fail, 15_000);
    script.onerror = fail;
    script.onload = () => {
      const loaded = target.MathJax as MathJaxRuntime | undefined;
      Promise.resolve(loaded?.startup?.promise).then(() => {
        if (!loaded?.typesetPromise) { fail(); return; }
        clearTimeout(timeout);
        resolve(loaded);
      }, fail);
    };
    document.head.appendChild(script);
  }).catch((error) => {
    loading = null; // A later render can retry after a transient CDN failure.
    throw error;
  });
  return loading;
}

/** MathJax 3 requires asynchronous typeset calls to be chained. A cancelled
 * render must not clear or typeset the replacement question's DOM. */
export async function typesetMath(element: Element, isCurrent: () => boolean): Promise<void> {
  const mathjax = await loadMathJax();
  const next = typesetting.then(async () => {
    if (!isCurrent() || !element.isConnected) return;
    mathjax.typesetClear?.([element]);
    await mathjax.typesetPromise([element]);
  });
  typesetting = next.catch(() => {});
  await next;
}
