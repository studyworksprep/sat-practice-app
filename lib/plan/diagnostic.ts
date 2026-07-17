// Diagnostic set selection (§6.4). Pure: given the candidate pool
// (id + domain + difficulty rows) pick a short, balanced set that
// touches every domain at mixed difficulty — enough signal for the
// first mastery snapshot and plan generation without feeling like a
// full test. Randomness is injected so tests are deterministic.
//
// Selection per domain (default 2): one easier question (difficulty
// <= 2) and one harder (>= 2), falling back to whatever the domain
// has. Output interleaves domains round-robin so the student hops
// between topics rather than grinding one domain at a time.

export interface DiagnosticCandidate {
  id: string;
  domainCode: string;
  difficulty: number | null;
}

export const DIAGNOSTIC_PER_DOMAIN = 2;

function pickOne<T>(pool: T[], rand: () => number): T | undefined {
  if (pool.length === 0) return undefined;
  return pool[Math.floor(rand() * pool.length) % pool.length];
}

export function selectDiagnosticQuestions(
  candidates: readonly DiagnosticCandidate[],
  opts: { perDomain?: number; rand?: () => number } = {},
): string[] {
  const perDomain = opts.perDomain ?? DIAGNOSTIC_PER_DOMAIN;
  const rand = opts.rand ?? Math.random;

  const byDomain = new Map<string, DiagnosticCandidate[]>();
  for (const c of candidates) {
    if (!byDomain.has(c.domainCode)) byDomain.set(c.domainCode, []);
    byDomain.get(c.domainCode)!.push(c);
  }
  // Sorted for a deterministic domain order under a seeded rand.
  const domains = [...byDomain.keys()].sort();

  // Per-domain picks: easier first, then harder, then anything left.
  const picksByDomain = new Map<string, string[]>();
  for (const d of domains) {
    const pool = byDomain.get(d)!;
    const chosen: DiagnosticCandidate[] = [];
    const remaining = () => pool.filter((c) => !chosen.includes(c));

    const easier = pool.filter((c) => (c.difficulty ?? 2) <= 2);
    const first = pickOne(easier, rand) ?? pickOne(pool, rand);
    if (first) chosen.push(first);

    while (chosen.length < perDomain) {
      const rest = remaining();
      const harder = rest.filter((c) => (c.difficulty ?? 2) >= 2);
      const next = pickOne(harder, rand) ?? pickOne(rest, rand);
      if (!next) break;
      chosen.push(next);
    }
    picksByDomain.set(d, chosen.map((c) => c.id));
  }

  // Round-robin interleave across domains.
  const out: string[] = [];
  for (let i = 0; i < perDomain; i++) {
    for (const d of domains) {
      const id = picksByDomain.get(d)?.[i];
      if (id) out.push(id);
    }
  }
  return out;
}
