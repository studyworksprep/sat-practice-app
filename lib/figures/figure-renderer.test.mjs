import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderFigureSvg } from './figure-renderer.mjs';

const TRIANGLE = {
  points: [
    { name: 'A', x: 0, y: 0 },
    { name: 'B', x: 8, y: 0 },
    { name: 'C', x: 8, y: 6 },
  ],
  polygons: [{ vertices: ['A', 'B', 'C'] }],
  segments: [
    { from: 'A', to: 'B', label: '8' },
    { from: 'B', to: 'C', label: '6' },
    { from: 'A', to: 'C', label: '10', dashed: true },
  ],
  angle_marks: [
    { vertex: 'B', from: 'A', to: 'C', right_angle: true },
    { vertex: 'A', from: 'B', to: 'C', label: '37°' },
  ],
};

test('renders a right triangle with labels, marks, and dots', () => {
  const { svg, width, height, warnings } = renderFigureSvg(TRIANGLE);
  assert.equal(warnings.length, 0);
  assert.ok(width > 0 && height > 0);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('<polygon points='));       // triangle outline
  assert.ok(svg.includes('stroke-dasharray'));       // dashed hypotenuse
  assert.ok(svg.includes('<polyline points='));      // right-angle mark
  // Angle at A: rays point E and NE — math-CCW short rotation, which
  // must render with sweep-flag 0 so the arc wraps the vertex.
  assert.ok(svg.includes('A 22 22 0 0 0'));
  assert.ok(svg.includes('>37°<'));                  // angle label
  assert.ok(svg.includes('>10<'));                   // side label
  assert.equal((svg.match(/<circle[^>]*r="3"/g) || []).length, 3); // vertex dots
});

test('is deterministic — same spec, byte-identical SVG', () => {
  assert.equal(renderFigureSvg(TRIANGLE).svg, renderFigureSvg(TRIANGLE).svg);
});

test('circle, ticks, arrows, free labels, axes', () => {
  const { svg, warnings } = renderFigureSvg({
    points: [{ name: 'O', x: 0, y: 0 }, { name: 'P', x: 5, y: 0 }],
    circles: [{ center: 'O', radius: 5 }],
    segments: [
      { from: 'O', to: 'P', label: '5', ticks: 1 },
      { from: { x: -7, y: -6 }, to: { x: 7, y: -6 }, arrow_start: true, arrow_end: true },
    ],
    labels: [{ x: 0, y: 6.2, text: 'circle Q' }],
    axes: true,
  });
  assert.equal(warnings.length, 0);
  assert.ok(svg.includes('<circle') && svg.includes('fill="none"'));
  assert.equal((svg.match(/<polygon points=/g) || []).length, 4); // 2 seg arrows + 2 axis arrows
  assert.ok(svg.includes('>circle Q<'));
  assert.ok(svg.includes('>x<') && svg.includes('>y<'));
});

test('escapes label text', () => {
  const { svg } = renderFigureSvg({
    points: [{ name: 'A', x: 0, y: 0 }, { name: 'B', x: 1, y: 1 }],
    segments: [{ from: 'A', to: 'B', label: 'a < b & "c"' }],
  });
  assert.ok(svg.includes('a &lt; b &amp; &quot;c&quot;'));
  assert.ok(!svg.includes('a < b &'));
});

test('throws on unknown point names and empty specs', () => {
  assert.throws(() => renderFigureSvg({ segments: [{ from: 'A', to: 'B' }] }), /unknown point name|expected a point/);
  assert.throws(() => renderFigureSvg({}), /no drawable content/);
  assert.throws(() => renderFigureSvg({ points: [{ name: 'A', x: 1, y: 1 }] }), /single point/);
  assert.throws(() => renderFigureSvg({ circles: [{ center: { x: 0, y: 0 }, radius: -1 }] }), /positive radius/);
});

test('angle arc sweeps the correct side for a math-CW short rotation', () => {
  // Vertex O with rays W (to Q) and NE (to P): short rotation from W
  // to NE is math-CW → sweep-flag 1 on screen.
  const { svg } = renderFigureSvg({
    points: [{ name: 'O', x: 0, y: 0 }, { name: 'Q', x: -5, y: 0 }, { name: 'P', x: 4, y: 3 }],
    segments: [{ from: 'O', to: 'P' }, { from: 'Q', to: 'O' }],
    angle_marks: [{ vertex: 'O', from: 'Q', to: 'P', label: '143°' }],
  });
  assert.ok(svg.includes('A 22 22 0 0 1'));
});

test('warns instead of throwing when axes fall outside bounds', () => {
  const { warnings } = renderFigureSvg({
    points: [{ name: 'A', x: 10, y: 10 }, { name: 'B', x: 20, y: 14 }],
    segments: [{ from: 'A', to: 'B' }],
    axes: true,
  });
  assert.equal(warnings.length, 2);
});
