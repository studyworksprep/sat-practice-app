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
import a from '../../admin.module.css';

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
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <a href="/admin">← Admin</a>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Performance</div>
        <h1 className={a.h1}>Student performance</h1>
        <p className={a.sub}>
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
        <BigStat value={stats.avgRW ?? '—'} label="Avg R&W" color="var(--color-app-accent)" size="small" />
        <BigStat value={stats.avgMath ?? '—'} label="Avg math" color="var(--color-diff-extreme-fg)" size="small" />
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

// Page chrome (container / breadcrumb / header) comes from
// admin.module.css; the inline objects below cover the per-card
// internals — chart bars, score-band tally, heatmap cells.
const S = {
  row2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 'var(--s3)', marginBottom: 'var(--s3)' },
  card: { padding: '18px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s3)' },
  h3: { fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 700, letterSpacing: '-0.005em', margin: 0, color: 'var(--color-navy-900)' },
  badge: { padding: '2px 10px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', border: '1px solid var(--border)' },
  badgeBlue:   { background: 'var(--color-app-accent-soft)',  color: 'var(--color-app-accent)',     borderColor: 'var(--color-app-accent)' },
  badgePurple: { background: 'var(--color-diff-extreme-bg)',  color: 'var(--color-diff-extreme-fg)', borderColor: 'var(--color-diff-extreme-bd)' },
  badgeRed:    { background: 'var(--color-danger-bg)',        color: 'var(--color-diff-hard-fg)',   borderColor: 'var(--color-danger)' },
  badgeGreen:  { background: 'var(--color-success-bg)',       color: 'var(--color-diff-easy-fg)',   borderColor: 'var(--color-success)' },
  badgeYellow: { background: 'var(--color-diff-med-bg)',      color: 'var(--color-diff-med-fg)',    borderColor: 'var(--color-diff-med-bd)' },

  bigRow: { display: 'flex', gap: 'var(--s3)', marginBottom: 'var(--s2)' },
  bigStat: { display: 'flex', flexDirection: 'column', gap: 2 },
  bigStatNum: { fontSize: 28, fontWeight: 750, letterSpacing: '-0.01em', color: 'var(--fg1)', fontVariantNumeric: 'tabular-nums' },
  bigStatNumSmall: { fontSize: 18, fontWeight: 700, color: 'var(--fg1)', fontVariantNumeric: 'tabular-nums' },
  bigStatLabel: { fontSize: 11, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 },

  bars: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 },
  barRow: { display: 'grid', gridTemplateColumns: '110px 1fr 48px', alignItems: 'center', gap: 8, fontSize: 12 },
  barLabel: { color: 'var(--fg2)' },
  barBg: { height: 8, background: 'var(--color-slate-100)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' },
  barFill: { height: '100%', background: 'var(--color-app-accent)', borderRadius: 'var(--radius-pill)' },
  barVal: { color: 'var(--fg1)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 },
  footnote: { fontSize: 11, color: 'var(--fg3)', marginTop: 'var(--s3)', marginBottom: 0 },

  chart: { display: 'flex', gap: 6, height: 120, alignItems: 'flex-end', marginTop: 'var(--s3)' },
  chartBar: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  chartBarStack: { flex: 1, width: '100%', background: 'var(--color-slate-50)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'flex-end' },
  chartBarFill: { width: '100%', background: 'var(--color-app-accent)', borderRadius: 'var(--radius-sm)' },
  chartBarLabel: { fontSize: 11, color: 'var(--fg3)', fontVariantNumeric: 'tabular-nums' },
  chartBarCount: { fontSize: 11, color: 'var(--fg1)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' },

  qTable: { display: 'flex', flexDirection: 'column' },
  qHead: { display: 'grid', gridTemplateColumns: '80px 1fr 60px 50px', padding: '6px 8px', fontSize: 11, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, borderBottom: '1px solid var(--border)' },
  qRow: { display: 'grid', gridTemplateColumns: '80px 1fr 60px 50px', padding: '8px', fontSize: 13, borderBottom: '1px solid var(--border)', alignItems: 'center' },
  qId: { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg3)', textDecoration: 'none' },
  qSkill: { color: 'var(--fg1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  qAcc: { fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  qN: { color: 'var(--fg3)', textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums' },

  heatGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6 },
  heatCell: { padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  heatLabel: { fontSize: 12, color: 'var(--color-navy-900)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  heatVal: { fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },

  empty: { color: '#9ca3af', fontStyle: 'italic', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0', margin: 0 },
};
