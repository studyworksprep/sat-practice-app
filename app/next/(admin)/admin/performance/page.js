// Admin performance — student performance analytics carve-out from
// the legacy AdminDashboard.js "Student Performance" tab. Read-only
// aggregates: overall accuracy trend, score distribution, hardest
// and easiest questions, skill heatmap.
//
// The aggregation lives in loader.js so the Server Component stays
// focused on rendering. No client island — nothing is interactive.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { loadPerformanceStats } from './loader';

export const dynamic = 'force-dynamic';

export default async function AdminPerformancePage() {
  const { profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const stats = await loadPerformanceStats(supabase);

  return (
    <main style={S.main}>
      <nav style={S.breadcrumb}>
        <a href="/admin" style={S.crumbLink}>← Admin</a>
      </nav>

      <header style={S.header}>
        <h1 style={S.h1}>Student performance</h1>
        <p style={S.sub}>
          Aggregate accuracy, score distribution, per-question and per-skill
          signals. First-attempt data over the last {30} days.
        </p>
      </header>

      <div style={S.row2}>
        <OverallAccuracy stats={stats.overallAccuracy} />
        <ScoreDistribution stats={stats.scoreDistribution} />
      </div>

      <div style={S.row2}>
        <QuestionList title="Hardest questions" badge="Lowest accuracy" badgeStyle={S.badgeRed} rows={stats.hardestQuestions} accentColor="#dc2626" />
        <QuestionList title="Easiest questions" badge="Highest accuracy" badgeStyle={S.badgeGreen} rows={stats.easiestQuestions} accentColor="#16a34a" />
      </div>

      {stats.skillHeatmap.length > 0 && (
        <Card>
          <CardHeader
            title="Skill accuracy heatmap"
            badge={`${stats.skillHeatmap.length} skill${stats.skillHeatmap.length !== 1 ? 's' : ''}`}
            badgeStyle={S.badgeYellow}
          />
          <div style={S.heatGrid}>
            {stats.skillHeatmap.map((s) => {
              const pct = s.accuracy;
              const hue = Math.round((pct / 100) * 120);
              const sat = Math.round(40 + (pct / 100) * 45);
              const light = Math.round(90 - (pct / 100) * 30);
              const borderLight = Math.round(70 - (pct / 100) * 25);
              const textLight = Math.round(35 - (pct / 100) * 15);
              return (
                <div
                  key={s.skill_code}
                  style={{
                    ...S.heatCell,
                    background: `hsl(${hue}, ${sat}%, ${light}%)`,
                    borderColor: `hsl(${hue}, 60%, ${borderLight}%)`,
                  }}
                  title={`${s.skill_name}: ${s.accuracy}% (${s.total} attempts)`}
                >
                  <span style={S.heatLabel}>{s.skill_name}</span>
                  <span style={{ ...S.heatVal, color: `hsl(${hue}, 60%, ${textLight}%)` }}>
                    {s.accuracy}%
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </main>
  );
}

function OverallAccuracy({ stats }) {
  const trend = stats.current != null && stats.previous != null ? stats.current - stats.previous : null;
  const trendColor = trend == null ? '#9ca3af' : trend > 0 ? '#16a34a' : trend < 0 ? '#dc2626' : '#9ca3af';
  const currentColor = stats.current == null ? '#9ca3af' : stats.current >= 70 ? '#16a34a' : stats.current >= 50 ? '#eab308' : '#dc2626';

  return (
    <Card>
      <CardHeader title="Overall accuracy" badge="First attempts, 30d" badgeStyle={S.badgeBlue} />
      <div style={S.bigRow}>
        <BigStat value={stats.current != null ? `${stats.current}%` : '—'} label="Current" color={currentColor} />
        <BigStat value={stats.previous != null ? `${stats.previous}%` : '—'} label="Prior 30d" color="#6b7280" size="small" />
        <BigStat
          value={trend == null ? '—' : `${trend > 0 ? '+' : ''}${trend}%`}
          label="Trend"
          color={trendColor}
          size="small"
        />
      </div>
      {stats.domains.length > 0 && (
        <div style={S.bars}>
          {stats.domains.map((d) => (
            <div key={d.domain_code} style={S.barRow}>
              <span style={S.barLabel}>{d.domain_name ?? d.domain_code}</span>
              <div style={S.barBg}>
                <div style={{ ...S.barFill, width: `${d.accuracy ?? 0}%` }} />
              </div>
              <span style={S.barVal}>{d.accuracy != null ? `${d.accuracy}%` : '—'}</span>
            </div>
          ))}
        </div>
      )}
      <p style={S.footnote}>{stats.totalAttempts.toLocaleString()} first attempts</p>
    </Card>
  );
}

function ScoreDistribution({ stats }) {
  if (stats.totalTests === 0) {
    return (
      <Card>
        <CardHeader title="Score distribution" badge="0 tests" badgeStyle={S.badgePurple} />
        <p style={S.empty}>No completed tests yet.</p>
      </Card>
    );
  }
  const maxCount = Math.max(1, ...stats.buckets.map((b) => b.count));
  return (
    <Card>
      <CardHeader title="Score distribution" badge={`${stats.totalTests} test${stats.totalTests !== 1 ? 's' : ''}`} badgeStyle={S.badgePurple} />
      <div style={S.bigRow}>
        <BigStat value={stats.avgComposite ?? '—'} label="Avg composite" />
        <BigStat value={stats.avgRW ?? '—'} label="Avg R&W" color="#2563eb" size="small" />
        <BigStat value={stats.avgMath ?? '—'} label="Avg math" color="#7c3aed" size="small" />
      </div>
      <div style={S.chart}>
        {stats.buckets.map((b, i) => (
          <div key={i} style={S.chartBar}>
            <div style={S.chartBarStack}>
              <div
                style={{ ...S.chartBarFill, height: `${(b.count / maxCount) * 100}%` }}
                title={`${b.count} test${b.count !== 1 ? 's' : ''}`}
              />
            </div>
            <div style={S.chartBarLabel}>{b.range.split('-')[0]}</div>
            {b.count > 0 && <div style={S.chartBarCount}>{b.count}</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function QuestionList({ title, badge, badgeStyle, rows, accentColor }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader title={title} badge={badge} badgeStyle={badgeStyle} />
        <p style={S.empty}>Not enough data (min 5 attempts per question).</p>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title={title} badge={badge} badgeStyle={badgeStyle} />
      <div style={S.qTable}>
        <div style={S.qHead}>
          <span>Question</span><span>Skill</span><span>Acc.</span><span>n</span>
        </div>
        {rows.map((q, i) => (
          <div key={i} style={S.qRow}>
            <a
              href={`/practice/${q.question_uuid ?? q.question_id}`}
              target="_blank"
              rel="noopener noreferrer"
              title={q.question_id}
              style={S.qId}
            >
              {q.question_id?.length > 12 ? q.question_id.slice(0, 8) : q.question_id ?? '—'}
            </a>
            <span style={S.qSkill}>{q.skill_name ?? q.domain_name ?? '—'}</span>
            <span style={{ ...S.qAcc, color: accentColor }}>{q.accuracy}%</span>
            <span style={S.qN}>{q.attempt_count}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Card({ children }) {
  return <section style={S.card}>{children}</section>;
}

function CardHeader({ title, badge, badgeStyle }) {
  return (
    <div style={S.cardHead}>
      <h3 style={S.h3}>{title}</h3>
      {badge && <span style={{ ...S.badge, ...(badgeStyle ?? {}) }}>{badge}</span>}
    </div>
  );
}

function BigStat({ value, label, color = '#111827', size = 'large' }) {
  return (
    <div style={S.bigStat}>
      <span style={{ ...(size === 'large' ? S.bigStatNum : S.bigStatNumSmall), color }}>
        {value ?? '—'}
      </span>
      <span style={S.bigStatLabel}>{label}</span>
    </div>
  );
}

const S = {
  main: { maxWidth: 1200, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' },
  breadcrumb: { marginBottom: '1rem', fontSize: '0.85rem', color: '#6b7280' },
  crumbLink: { color: '#2563eb', textDecoration: 'none' },
  header: { marginBottom: '1.5rem' },
  h1: { fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' },
  sub: { color: '#4b5563', marginTop: 0 },
  row2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1rem', marginBottom: '1rem' },
  card: { padding: '1.25rem', background: 'white', border: '1px solid #e5e7eb', borderRadius: 10 },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' },
  h3: { fontSize: '0.95rem', fontWeight: 600, margin: 0, color: '#111827' },
  badge: { padding: '0.2rem 0.6rem', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600 },
  badgeBlue:   { background: '#dbeafe', color: '#1d4ed8' },
  badgePurple: { background: '#f3e8ff', color: '#7c3aed' },
  badgeRed:    { background: '#fee2e2', color: '#991b1b' },
  badgeGreen:  { background: '#dcfce7', color: '#166534' },
  badgeYellow: { background: '#fef3c7', color: '#92400e' },

  bigRow: { display: 'flex', gap: '1rem', marginBottom: '0.75rem' },
  bigStat: { display: 'flex', flexDirection: 'column', gap: '0.1rem' },
  bigStatNum: { fontSize: '2rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  bigStatNumSmall: { fontSize: '1.25rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  bigStatLabel: { fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.025em' },

  bars: { display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' },
  barRow: { display: 'grid', gridTemplateColumns: '110px 1fr 48px', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' },
  barLabel: { color: '#374151' },
  barBg: { height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', background: '#3b82f6', borderRadius: 4 },
  barVal: { color: '#111827', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  footnote: { fontSize: '0.75rem', color: '#6b7280', marginTop: '0.75rem', marginBottom: 0 },

  chart: { display: 'flex', gap: '0.35rem', height: 120, alignItems: 'flex-end', marginTop: '0.75rem' },
  chartBar: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' },
  chartBarStack: { flex: 1, width: '100%', background: '#f9fafb', borderRadius: 4, display: 'flex', alignItems: 'flex-end' },
  chartBarFill: { width: '100%', background: 'linear-gradient(180deg, #a78bfa, #7c3aed)', borderRadius: 4 },
  chartBarLabel: { fontSize: '0.65rem', color: '#9ca3af' },
  chartBarCount: { fontSize: '0.65rem', color: '#374151', fontWeight: 600 },

  qTable: { display: 'flex', flexDirection: 'column' },
  qHead: { display: 'grid', gridTemplateColumns: '80px 1fr 60px 50px', padding: '0.35rem 0.5rem', fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.025em', borderBottom: '1px solid #e5e7eb' },
  qRow: { display: 'grid', gridTemplateColumns: '80px 1fr 60px 50px', padding: '0.45rem 0.5rem', fontSize: '0.85rem', borderBottom: '1px solid #f3f4f6', alignItems: 'center' },
  qId: { fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280', textDecoration: 'none' },
  qSkill: { color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  qAcc: { fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  qN: { color: '#6b7280', textAlign: 'right', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' },

  heatGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.4rem' },
  heatCell: { padding: '0.6rem 0.75rem', borderRadius: 6, border: '1px solid', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' },
  heatLabel: { fontSize: '0.75rem', color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  heatVal: { fontSize: '0.85rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' },

  empty: { color: '#9ca3af', fontStyle: 'italic', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0', margin: 0 },
};
