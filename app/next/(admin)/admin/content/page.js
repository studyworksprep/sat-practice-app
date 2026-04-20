// Admin content — content-management carve-out from the legacy
// AdminDashboard.js "Question Content" tab.
//
// Four focused sections:
//   1. Flagged questions — read-only list of broken/flagged items
//   2. Score conversions — add/delete practice-test scoring curves
//   3. Routing rules — edit per-test adaptive routing
//   4. Skill learnability — batch-edit per-skill learnability ratings
//
// Batch-fix-from-screenshots is deferred — it gets its own page as
// part of the questions_v2 carve-out.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { formatDate } from '@/lib/formatters';
import { Table, Th, Td } from '@/lib/ui/Table';
import { ScoreConversionSection } from './ScoreConversionSection';
import { TestThresholdsSection } from './TestThresholdsSection';
import { LearnabilitySection } from './LearnabilitySection';

export const dynamic = 'force-dynamic';

export default async function AdminContentPage({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const routingTestId = typeof sp.routing_test === 'string' ? sp.routing_test : '';

  const { profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const [
    { data: flagged },
    { data: tests },
    { data: conversions },
    { data: skills },
    { data: selectedTest },
  ] = await Promise.all([
    loadFlagged(supabase),
    supabase.from('practice_tests_v2').select('id, code, name, is_adaptive, rw_route_threshold, math_route_threshold').is('deleted_at', null).order('created_at').limit(200),
    supabase.from('score_conversion').select('id, test_id, test_name, section, module1_correct, module2_correct, scaled_score').order('test_name').order('section').order('scaled_score', { ascending: false }).limit(2000),
    loadLearnability(supabase),
    routingTestId
      ? supabase.from('practice_tests_v2').select('id, is_adaptive, rw_route_threshold, math_route_threshold').eq('id', routingTestId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <main style={S.main}>
      <nav style={S.breadcrumb}>
        <a href="/admin" style={S.crumbLink}>← Admin</a>
      </nav>

      <header style={S.header}>
        <h1 style={S.h1}>Question content</h1>
        <p style={S.sub}>
          Flagged items, scoring curves, adaptive routing, and skill
          learnability ratings — the content-operations surface.
        </p>
      </header>

      <Section
        title={`Flagged questions (${flagged?.length ?? 0})`}
        badge={flagged && flagged.length > 0 ? `${flagged.length} broken` : null}
        badgeStyle={S.badgeRed}
      >
        {(!flagged || flagged.length === 0) ? (
          <p style={S.empty}>No flagged questions.</p>
        ) : (
          <Table style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <Th>Question</Th>
                  <Th>Domain</Th>
                  <Th>Skill</Th>
                  <Th>Difficulty</Th>
                  <Th>Flagged by</Th>
                  <Th>Date</Th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((q) => (
                  <tr key={q.id}>
                    <Td style={{ fontFamily: 'monospace' }}>
                      <a href={`/tutor/review/${q.id}`} style={S.link}>
                        {String(q.question_id).slice(0, 8)}
                      </a>
                    </Td>
                    <Td>{q.domain_name ?? '—'}</Td>
                    <Td>{q.skill_name ?? '—'}</Td>
                    <Td style={{ textAlign: 'center' }}>{q.difficulty ?? '—'}</Td>
                    <Td>
                      {q.flagged_by_name ?? '—'}
                      {q.flagged_by_role && (
                        <span style={{ ...S.rolePill, ...roleColor(q.flagged_by_role) }}>
                          {q.flagged_by_role}
                        </span>
                      )}
                    </Td>
                    <Td style={{ color: '#6b7280', fontSize: '0.8rem' }}>{formatDate(q.broken_at) || '—'}</Td>
                  </tr>
                ))}
              </tbody>
          </Table>
        )}
      </Section>

      <Section title="Score conversions">
        <ScoreConversionSection tests={tests ?? []} conversions={conversions ?? []} />
      </Section>

      <Section title="Adaptive routing thresholds">
        <TestThresholdsSection
          tests={tests ?? []}
          selectedTestId={routingTestId}
          currentRW={selectedTest?.rw_route_threshold ?? null}
          currentMath={selectedTest?.math_route_threshold ?? null}
        />
      </Section>

      <Section title="Skill learnability">
        <LearnabilitySection skills={skills ?? []} />
      </Section>
    </main>
  );
}

async function loadFlagged(supabase) {
  // v2 questions have domain/skill/difficulty inline — no taxonomy join.
  // questions_v2 doesn't have broken_by/broken_at columns (v1-only),
  // so we just list what's flagged without who flagged it.
  const { data: rows } = await supabase
    .from('questions_v2')
    .select('id, display_code, domain_name, skill_name, difficulty, updated_at')
    .eq('is_broken', true)
    .order('updated_at', { ascending: false });

  return {
    data: (rows ?? []).map((r) => ({
      id: r.id,
      question_id: r.display_code ?? r.id,
      broken_at: r.updated_at,
      domain_name: r.domain_name,
      skill_name: r.skill_name,
      difficulty: r.difficulty,
      flagged_by_name: null,
      flagged_by_role: null,
    })),
  };
}

async function loadLearnability(supabase) {
  // Pull distinct skills from questions_v2 (v2 has taxonomy inline).
  const [{ data: ratings }, { data: questions }] = await Promise.all([
    supabase.from('skill_learnability').select('skill_code, learnability'),
    supabase.from('questions_v2').select('skill_code, skill_name, domain_name').not('skill_code', 'is', null).limit(5000),
  ]);

  const skillMap = new Map();
  for (const q of questions ?? []) {
    if (!q.skill_code) continue;
    if (!skillMap.has(q.skill_code)) {
      skillMap.set(q.skill_code, { skill_code: q.skill_code, skill_name: q.skill_name, domain_name: q.domain_name });
    }
  }
  const ratingMap = Object.fromEntries((ratings ?? []).map((r) => [r.skill_code, r.learnability]));

  return {
    data: [...skillMap.values()]
      .map((s) => ({ ...s, learnability: ratingMap[s.skill_code] ?? 5 }))
      .sort((a, b) => (a.domain_name ?? '').localeCompare(b.domain_name ?? '') || (a.skill_name ?? '').localeCompare(b.skill_name ?? '')),
  };
}

function Section({ title, badge, badgeStyle, children }) {
  return (
    <section style={S.section}>
      <div style={S.sectionHead}>
        <h2 style={S.h2}>{title}</h2>
        {badge && <span style={{ ...S.badge, ...(badgeStyle ?? {}) }}>{badge}</span>}
      </div>
      {children}
    </section>
  );
}


function roleColor(role) {
  switch (role) {
    case 'admin':   return { background: '#fef3c7', color: '#92400e' };
    case 'manager': return { background: '#ede9fe', color: '#5b21b6' };
    case 'teacher': return { background: '#dbeafe', color: '#1d4ed8' };
    case 'student': return { background: '#dcfce7', color: '#166534' };
    default:        return { background: '#f3f4f6', color: '#6b7280' };
  }
}

const S = {
  main: { maxWidth: 1200, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' },
  breadcrumb: { marginBottom: '1rem', fontSize: '0.85rem', color: '#6b7280' },
  crumbLink: { color: '#2563eb', textDecoration: 'none' },
  header: { marginBottom: '1.5rem' },
  h1: { fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' },
  sub: { color: '#4b5563', marginTop: 0 },

  section: { marginBottom: '1.5rem', padding: '1.25rem', background: 'white', border: '1px solid #e5e7eb', borderRadius: 10 },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  h2: { fontSize: '1rem', fontWeight: 600, margin: 0, color: '#111827' },
  badge: { padding: '0.15rem 0.55rem', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600 },
  badgeRed: { background: '#fee2e2', color: '#991b1b' },

  link: { color: '#2563eb', textDecoration: 'none' },
  rolePill: { display: 'inline-block', marginLeft: '0.4rem', padding: '0.05rem 0.4rem', borderRadius: 999, fontSize: '0.65rem', fontWeight: 600 },
  empty: { color: '#9ca3af', fontStyle: 'italic', fontSize: '0.85rem', padding: '0.5rem 0', margin: 0 },
};
