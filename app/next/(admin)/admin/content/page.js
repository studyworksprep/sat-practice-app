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
import { ScoreConversionSection } from './ScoreConversionSection';
import { RoutingRulesSection } from './RoutingRulesSection';
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
    { data: routingRules },
    { data: routingModules },
  ] = await Promise.all([
    loadFlagged(supabase),
    supabase.from('practice_tests').select('id, code, name').order('created_at').limit(200),
    supabase.from('score_conversion').select('id, test_id, test_name, section, module1_correct, module2_correct, scaled_score').order('test_name').order('section').order('scaled_score', { ascending: false }).limit(2000),
    loadLearnability(supabase),
    routingTestId
      ? supabase.from('practice_test_routing_rules').select('*').eq('practice_test_id', routingTestId).order('subject_code').order('threshold')
      : Promise.resolve({ data: [] }),
    routingTestId
      ? supabase.from('practice_test_modules').select('id, subject_code, module_number, route_code').eq('practice_test_id', routingTestId).order('subject_code').order('module_number')
      : Promise.resolve({ data: [] }),
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
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Question</th>
                  <th style={S.th}>Domain</th>
                  <th style={S.th}>Skill</th>
                  <th style={S.th}>Difficulty</th>
                  <th style={S.th}>Flagged by</th>
                  <th style={S.th}>Date</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((q) => (
                  <tr key={q.id}>
                    <td style={S.tdCode}>
                      <a href={`/practice/${q.question_id}`} style={S.link}>
                        {String(q.question_id).slice(0, 8)}
                      </a>
                    </td>
                    <td style={S.td}>{q.domain_name ?? '—'}</td>
                    <td style={S.td}>{q.skill_name ?? '—'}</td>
                    <td style={S.tdCenter}>{q.difficulty ?? '—'}</td>
                    <td style={S.td}>
                      {q.flagged_by_name ?? '—'}
                      {q.flagged_by_role && (
                        <span style={{ ...S.rolePill, ...roleColor(q.flagged_by_role) }}>
                          {q.flagged_by_role}
                        </span>
                      )}
                    </td>
                    <td style={S.tdMuted}>{formatDate(q.broken_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Score conversions">
        <ScoreConversionSection tests={tests ?? []} conversions={conversions ?? []} />
      </Section>

      <Section title="Adaptive routing rules">
        <RoutingRulesSection
          tests={tests ?? []}
          selectedTestId={routingTestId}
          rules={routingRules ?? []}
          modules={routingModules ?? []}
        />
      </Section>

      <Section title="Skill learnability">
        <LearnabilitySection skills={skills ?? []} />
      </Section>
    </main>
  );
}

async function loadFlagged(supabase) {
  const { data: rows } = await supabase
    .from('questions')
    .select('id, question_id, is_broken, broken_by, broken_at')
    .eq('is_broken', true)
    .order('broken_at', { ascending: false });

  if (!rows || rows.length === 0) return { data: [] };

  const qIds = rows.map((r) => r.id);
  const flaggerIds = [...new Set(rows.map((r) => r.broken_by).filter(Boolean))];

  const [{ data: tax }, { data: flaggers }] = await Promise.all([
    supabase
      .from('question_taxonomy')
      .select('question_id, domain_name, skill_name, difficulty')
      .in('question_id', qIds),
    flaggerIds.length > 0
      ? supabase.from('profiles').select('id, first_name, last_name, email, role').in('id', flaggerIds)
      : Promise.resolve({ data: [] }),
  ]);

  const taxMap = Object.fromEntries((tax ?? []).map((t) => [t.question_id, t]));
  const flaggerMap = Object.fromEntries((flaggers ?? []).map((f) => [f.id, f]));

  return {
    data: rows.map((r) => {
      const t = taxMap[r.id] ?? {};
      const f = r.broken_by ? flaggerMap[r.broken_by] : null;
      return {
        id: r.id,
        question_id: r.question_id,
        broken_at: r.broken_at,
        domain_name: t.domain_name ?? null,
        skill_name: t.skill_name ?? null,
        difficulty: t.difficulty ?? null,
        flagged_by_name: f ? ([f.first_name, f.last_name].filter(Boolean).join(' ') || f.email) : null,
        flagged_by_role: f?.role ?? null,
      };
    }),
  };
}

async function loadLearnability(supabase) {
  // Join learnability ratings with taxonomy skill names/domains.
  const [{ data: ratings }, { data: skills }] = await Promise.all([
    supabase.from('skill_learnability').select('skill_code, learnability'),
    supabase.from('question_taxonomy').select('skill_code, skill_name, domain_name').not('skill_code', 'is', null).limit(5000),
  ]);

  const skillMap = new Map();
  for (const s of skills ?? []) {
    if (!s.skill_code) continue;
    if (!skillMap.has(s.skill_code)) {
      skillMap.set(s.skill_code, { skill_code: s.skill_code, skill_name: s.skill_name, domain_name: s.domain_name });
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

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
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

  tableWrap: { overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th: { textAlign: 'left', padding: '0.4rem 0.7rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '0.7rem', textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.025em' },
  td: { padding: '0.4rem 0.7rem', borderBottom: '1px solid #f3f4f6' },
  tdCode: { padding: '0.4rem 0.7rem', borderBottom: '1px solid #f3f4f6', fontFamily: 'monospace' },
  tdCenter: { padding: '0.4rem 0.7rem', borderBottom: '1px solid #f3f4f6', textAlign: 'center' },
  tdMuted: { padding: '0.4rem 0.7rem', borderBottom: '1px solid #f3f4f6', color: '#6b7280', fontSize: '0.8rem' },
  link: { color: '#2563eb', textDecoration: 'none' },
  rolePill: { display: 'inline-block', marginLeft: '0.4rem', padding: '0.05rem 0.4rem', borderRadius: 999, fontSize: '0.65rem', fontWeight: 600 },
  empty: { color: '#9ca3af', fontStyle: 'italic', fontSize: '0.85rem', padding: '0.5rem 0', margin: 0 },
};
