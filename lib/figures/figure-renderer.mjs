// Deterministic geometry-figure renderer: declarative spec → styled
// SVG string. Built for AI lesson/question generation (the model
// computes coordinates; this module does all drawing), but usable by
// any authoring surface.
//
// Conventions:
//   - Spec coordinates are mathematical (y increases UPWARD); the
//     renderer flips to SVG screen space.
//   - Output is self-contained: white background, dark strokes, no
//     CSS/class dependencies — safe to serve as an <img src> from
//     storage in light or dark UI themes.
//   - Deterministic: same spec → byte-identical SVG (content-
//     addressed storage dedups repeat uploads).
//
// Shared .mjs (like lib/lesson/*.mjs) so the node --test unit runner
// can exercise it without a TS toolchain.

const STROKE = '#111827';
const FILL_LIGHT = '#e5e7eb';
const FONT = 'Helvetica, Arial, sans-serif';
const FONT_SIZE = 15;
const STROKE_W = 1.6;
const CONTENT_PX = 300; // longest content dimension in output pixels
const MARGIN_PX = 40; // room for labels outside the geometry

const DIRS = {
  N: { x: 0, y: 1 },
  NE: { x: 0.707, y: 0.707 },
  E: { x: 1, y: 0 },
  SE: { x: 0.707, y: -0.707 },
  S: { x: 0, y: -1 },
  SW: { x: -0.707, y: -0.707 },
  W: { x: -1, y: 0 },
  NW: { x: -0.707, y: 0.707 },
};

function num(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function fmt(v) {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-9) return null;
  return { x: v.x / len, y: v.y / len };
}

/**
 * Renders a figure spec to SVG.
 *
 * Spec shape (all coordinates math-oriented, y up):
 *   points:      [{ name?, x, y, label?, label_dir?, dot? }]
 *   segments:    [{ from, to, dashed?, ticks?, label?, label_dir?,
 *                   arrow_start?, arrow_end? }]
 *   polygons:    [{ vertices: [ref...], fill? }]
 *   circles:     [{ center, radius, dashed?, fill? }]
 *   angle_marks: [{ vertex, from, to, label?, right_angle?, radius? }]
 *   labels:      [{ x, y, text }]
 *   axes:        boolean
 * A `ref` is a point name (string) or an {x, y} literal.
 *
 * Returns { svg, width, height, warnings }. Throws on an unusable
 * spec (unknown point name, no drawable content, bad numbers).
 */
export function renderFigureSvg(spec) {
  if (!spec || typeof spec !== 'object') {
    throw new Error('figure spec must be an object');
  }
  const warnings = [];
  const points = Array.isArray(spec.points) ? spec.points : [];
  const segments = Array.isArray(spec.segments) ? spec.segments : [];
  const polygons = Array.isArray(spec.polygons) ? spec.polygons : [];
  const circles = Array.isArray(spec.circles) ? spec.circles : [];
  const angleMarks = Array.isArray(spec.angle_marks) ? spec.angle_marks : [];
  const freeLabels = Array.isArray(spec.labels) ? spec.labels : [];

  const byName = new Map();
  for (const p of points) {
    if (!p || !num(p.x) || !num(p.y)) throw new Error('every point needs numeric x and y');
    if (typeof p.name === 'string' && p.name.trim()) byName.set(p.name.trim(), p);
  }

  function resolve(ref, what) {
    if (typeof ref === 'string') {
      const p = byName.get(ref.trim());
      if (!p) throw new Error(`${what}: unknown point name "${ref}"`);
      return { x: p.x, y: p.y };
    }
    if (ref && num(ref.x) && num(ref.y)) return { x: ref.x, y: ref.y };
    throw new Error(`${what}: expected a point name or {x, y}`);
  }

  // ── Collect geometry in math space ────────────────────────────
  const boundPts = [];
  const addBound = (p) => boundPts.push(p);

  for (const p of points) addBound(p);

  const segs = segments.map((s, i) => {
    const a = resolve(s.from, `segment ${i + 1}`);
    const b = resolve(s.to, `segment ${i + 1}`);
    addBound(a);
    addBound(b);
    return { ...s, a, b };
  });

  const polys = polygons.map((pg, i) => {
    const verts = (Array.isArray(pg?.vertices) ? pg.vertices : []).map((v) =>
      resolve(v, `polygon ${i + 1}`),
    );
    if (verts.length < 3) throw new Error(`polygon ${i + 1}: needs at least 3 vertices`);
    verts.forEach(addBound);
    return { ...pg, verts };
  });

  const circs = circles.map((c, i) => {
    const ctr = resolve(c?.center, `circle ${i + 1}`);
    if (!num(c?.radius) || c.radius <= 0) throw new Error(`circle ${i + 1}: needs a positive radius`);
    addBound({ x: ctr.x - c.radius, y: ctr.y - c.radius });
    addBound({ x: ctr.x + c.radius, y: ctr.y + c.radius });
    return { ...c, ctr };
  });

  const marks = angleMarks.map((m, i) => {
    const v = resolve(m?.vertex, `angle mark ${i + 1}`);
    const f = resolve(m?.from, `angle mark ${i + 1}`);
    const t = resolve(m?.to, `angle mark ${i + 1}`);
    addBound(v);
    return { ...m, v, f, t };
  });

  for (const l of freeLabels) {
    if (!l || !num(l.x) || !num(l.y) || typeof l.text !== 'string') {
      throw new Error('every free label needs x, y, and text');
    }
    addBound(l);
  }

  if (boundPts.length === 0) throw new Error('figure has no drawable content');

  // ── Transform math → screen pixels ────────────────────────────
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of boundPts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const span = Math.max(spanX, spanY);
  if (span < 1e-9) throw new Error('figure content is a single point — nothing to draw');
  const s = CONTENT_PX / span;
  const width = Math.round(spanX * s + 2 * MARGIN_PX);
  const height = Math.round(spanY * s + 2 * MARGIN_PX);
  const T = (p) => ({ X: (p.x - minX) * s + MARGIN_PX, Y: (maxY - p.y) * s + MARGIN_PX });

  const centroid = {
    x: boundPts.reduce((acc, p) => acc + p.x, 0) / boundPts.length,
    y: boundPts.reduce((acc, p) => acc + p.y, 0) / boundPts.length,
  };

  // Direction helpers give offsets in PIXELS along a math-space
  // direction (y flipped at application time).
  const offset = (P, dirMath, px) => ({ X: P.X + dirMath.x * px, Y: P.Y - dirMath.y * px });

  function awayFromCentroid(p) {
    return normalize({ x: p.x - centroid.x, y: p.y - centroid.y }) ?? DIRS.NE;
  }

  function dirFor(spec_dir, fallback) {
    if (typeof spec_dir === 'string' && DIRS[spec_dir.trim().toUpperCase()]) {
      return DIRS[spec_dir.trim().toUpperCase()];
    }
    return fallback;
  }

  const el = [];
  const textEl = [];

  function text(P, str, anchor = 'middle') {
    textEl.push(
      `<text x="${fmt(P.X)}" y="${fmt(P.Y)}" fill="${STROKE}" font-family="${FONT}" font-size="${FONT_SIZE}" text-anchor="${anchor}" dominant-baseline="middle">${esc(str)}</text>`,
    );
  }

  function strokeAttrs(dashed) {
    return `stroke="${STROKE}" stroke-width="${STROKE_W}" stroke-linecap="round"${dashed ? ' stroke-dasharray="6 5"' : ''}`;
  }

  function arrowhead(tipP, dirMath) {
    const d = normalize(dirMath);
    if (!d) return;
    const perp = { x: -d.y, y: d.x };
    const back = 9;
    const half = 4;
    const b1 = offset(offset(tipP, { x: -d.x, y: -d.y }, back), perp, half);
    const b2 = offset(offset(tipP, { x: -d.x, y: -d.y }, back), perp, -half);
    el.push(
      `<polygon points="${fmt(tipP.X)},${fmt(tipP.Y)} ${fmt(b1.X)},${fmt(b1.Y)} ${fmt(b2.X)},${fmt(b2.Y)}" fill="${STROKE}"/>`,
    );
  }

  // ── Axes ──────────────────────────────────────────────────────
  if (spec.axes === true) {
    const pad = MARGIN_PX * 0.55;
    if (minY <= 0 && maxY >= 0) {
      const y0 = T({ x: 0, y: 0 }).Y;
      el.push(
        `<line x1="${fmt(MARGIN_PX - pad)}" y1="${fmt(y0)}" x2="${fmt(width - MARGIN_PX + pad)}" y2="${fmt(y0)}" stroke="${STROKE}" stroke-width="1"/>`,
      );
      arrowhead({ X: width - MARGIN_PX + pad, Y: y0 }, { x: 1, y: 0 });
      text({ X: width - MARGIN_PX + pad + 10, Y: y0 }, 'x');
    } else {
      warnings.push('axes requested but y=0 is outside the figure bounds — x-axis skipped');
    }
    if (minX <= 0 && maxX >= 0) {
      const x0 = T({ x: 0, y: 0 }).X;
      el.push(
        `<line x1="${fmt(x0)}" y1="${fmt(height - MARGIN_PX + pad)}" x2="${fmt(x0)}" y2="${fmt(MARGIN_PX - pad)}" stroke="${STROKE}" stroke-width="1"/>`,
      );
      arrowhead({ X: x0, Y: MARGIN_PX - pad }, { x: 0, y: 1 });
      text({ X: x0 + 10, Y: MARGIN_PX - pad - 8 }, 'y');
    } else {
      warnings.push('axes requested but x=0 is outside the figure bounds — y-axis skipped');
    }
  }

  // ── Fills first, then outlines, then annotations ──────────────
  for (const pg of polys) {
    const pts = pg.verts.map((v) => {
      const P = T(v);
      return `${fmt(P.X)},${fmt(P.Y)}`;
    }).join(' ');
    el.push(
      `<polygon points="${pts}" fill="${pg.fill ? FILL_LIGHT : 'none'}" ${strokeAttrs(false)} stroke-linejoin="round"/>`,
    );
  }

  for (const c of circs) {
    const P = T(c.ctr);
    el.push(
      `<circle cx="${fmt(P.X)}" cy="${fmt(P.Y)}" r="${fmt(c.radius * s)}" fill="${c.fill ? FILL_LIGHT : 'none'}" ${strokeAttrs(c.dashed)}/>`,
    );
  }

  for (const seg of segs) {
    const A = T(seg.a);
    const B = T(seg.b);
    el.push(`<line x1="${fmt(A.X)}" y1="${fmt(A.Y)}" x2="${fmt(B.X)}" y2="${fmt(B.Y)}" ${strokeAttrs(seg.dashed)}/>`);

    const dir = normalize({ x: seg.b.x - seg.a.x, y: seg.b.y - seg.a.y });
    if (!dir) continue;
    if (seg.arrow_end === true) arrowhead(B, dir);
    if (seg.arrow_start === true) arrowhead(A, { x: -dir.x, y: -dir.y });

    const tickCount = Number.isInteger(seg.ticks) ? Math.max(0, Math.min(3, seg.ticks)) : 0;
    if (tickCount > 0) {
      const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
      const M = T(mid);
      const perp = { x: -dir.y, y: dir.x };
      for (let k = 0; k < tickCount; k++) {
        const along = (k - (tickCount - 1) / 2) * 5;
        const C = offset(M, dir, along);
        const t1 = offset(C, perp, 5);
        const t2 = offset(C, perp, -5);
        el.push(`<line x1="${fmt(t1.X)}" y1="${fmt(t1.Y)}" x2="${fmt(t2.X)}" y2="${fmt(t2.Y)}" ${strokeAttrs(false)}/>`);
      }
    }

    if (typeof seg.label === 'string' && seg.label.trim()) {
      const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
      const perp = { x: -dir.y, y: dir.x };
      // Default to the side of the segment facing away from the
      // centroid so labels land outside the shape.
      const away = awayFromCentroid(mid);
      const side = perp.x * away.x + perp.y * away.y >= 0 ? perp : { x: -perp.x, y: -perp.y };
      const d = dirFor(seg.label_dir, side);
      text(offset(T(mid), d, 14), seg.label.trim());
    }
  }

  for (const m of marks) {
    const u1 = normalize({ x: m.f.x - m.v.x, y: m.f.y - m.v.y });
    const u2 = normalize({ x: m.t.x - m.v.x, y: m.t.y - m.v.y });
    if (!u1 || !u2) {
      warnings.push('angle mark with coincident points skipped');
      continue;
    }
    const V = T(m.v);
    const rPx = num(m.radius) && m.radius > 0 ? m.radius : 22;

    if (m.right_angle === true) {
      const c1 = offset(V, u1, rPx * 0.8);
      const c2 = offset(offset(V, u1, rPx * 0.8), u2, rPx * 0.8);
      const c3 = offset(V, u2, rPx * 0.8);
      el.push(
        `<polyline points="${fmt(c1.X)},${fmt(c1.Y)} ${fmt(c2.X)},${fmt(c2.Y)} ${fmt(c3.X)},${fmt(c3.Y)}" fill="none" ${strokeAttrs(false)}/>`,
      );
    } else {
      const P1 = offset(V, u1, rPx);
      const P2 = offset(V, u2, rPx);
      // cross > 0: the short (≤180°) rotation from u1 to u2 runs CCW
      // in math space. The y-flip mirrors orientation, so math-CCW is
      // the NEGATIVE-angle direction on screen → SVG sweep-flag 0
      // (and math-CW → sweep-flag 1). Getting this backwards doesn't
      // fail loudly — with large-arc=0 the other arc center gets
      // picked and the arc bows away from the vertex.
      const cross = u1.x * u2.y - u1.y * u2.x;
      const sweep = cross > 0 ? 0 : 1;
      el.push(
        `<path d="M ${fmt(P1.X)} ${fmt(P1.Y)} A ${fmt(rPx)} ${fmt(rPx)} 0 0 ${sweep} ${fmt(P2.X)} ${fmt(P2.Y)}" fill="none" ${strokeAttrs(false)}/>`,
      );
    }

    if (typeof m.label === 'string' && m.label.trim()) {
      const bis = normalize({ x: u1.x + u2.x, y: u1.y + u2.y }) ?? u1;
      text(offset(V, bis, rPx * 1.9), m.label.trim());
    }
  }

  for (const p of points) {
    const P = T(p);
    const named = typeof p.name === 'string' && p.name.trim() !== '';
    if (p.dot !== false && (p.dot === true || named)) {
      el.push(`<circle cx="${fmt(P.X)}" cy="${fmt(P.Y)}" r="3" fill="${STROKE}"/>`);
    }
    const label = typeof p.label === 'string' ? p.label : named ? p.name.trim() : '';
    if (label.trim()) {
      const d = dirFor(p.label_dir, awayFromCentroid(p));
      text(offset(P, d, 15), label.trim());
    }
  }

  for (const l of freeLabels) {
    text(T(l), l.text.trim());
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    el.join('') +
    textEl.join('') +
    `</svg>`;

  return { svg, width, height, warnings };
}
