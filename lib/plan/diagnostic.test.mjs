// Diagnostic selection tests (§6.4).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectDiagnosticQuestions } from './diagnostic.ts';

// Deterministic "random": always picks the first candidate.
const first = () => 0;

function pool() {
  const rows = [];
  for (const d of ['H', 'P', 'CAS', 'EOI']) {
    for (let i = 0; i < 5; i++) {
      rows.push({ id: `${d}-${i}`, domainCode: d, difficulty: (i % 3) + 1 });
    }
  }
  return rows;
}

test('picks perDomain questions per domain, interleaved round-robin', () => {
  const ids = selectDiagnosticQuestions(pool(), { rand: first });
  assert.equal(ids.length, 8); // 4 domains x 2
  // Round-robin: first pass hits each domain once before any repeats.
  const firstPassDomains = ids.slice(0, 4).map((id) => id.split('-')[0]);
  assert.deepEqual(firstPassDomains, ['CAS', 'EOI', 'H', 'P']); // sorted order
  // No duplicates.
  assert.equal(new Set(ids).size, ids.length);
});

test('mixes difficulty: an easier and a harder pick per domain', () => {
  const rows = pool();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ids = selectDiagnosticQuestions(rows, { rand: first });
  for (const d of ['H', 'P', 'CAS', 'EOI']) {
    const picks = ids.filter((id) => id.startsWith(`${d}-`)).map((id) => byId.get(id));
    assert.equal(picks.length, 2);
    assert.ok(picks.some((p) => p.difficulty <= 2), `${d} has an easier pick`);
    assert.ok(picks.some((p) => p.difficulty >= 2), `${d} has a harder pick`);
  }
});

test('a domain with one question contributes just that question', () => {
  const rows = [
    { id: 'H-0', domainCode: 'H', difficulty: 3 },
    { id: 'P-0', domainCode: 'P', difficulty: 1 },
    { id: 'P-1', domainCode: 'P', difficulty: 3 },
  ];
  const ids = selectDiagnosticQuestions(rows, { rand: first });
  assert.deepEqual(ids.sort(), ['H-0', 'P-0', 'P-1']);
});

test('empty pool yields empty selection', () => {
  assert.deepEqual(selectDiagnosticQuestions([], { rand: first }), []);
});

test('null difficulty is treated as medium (eligible both ways)', () => {
  const rows = [
    { id: 'H-a', domainCode: 'H', difficulty: null },
    { id: 'H-b', domainCode: 'H', difficulty: null },
  ];
  const ids = selectDiagnosticQuestions(rows, { rand: first });
  assert.equal(ids.length, 2);
});
