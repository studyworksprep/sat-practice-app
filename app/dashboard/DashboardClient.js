'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const MATH_CODES = new Set(['H', 'P', 'S', 'Q']);

function pct(correct, attempted) {
  if (!attempted) return null;
  return Math.round((correct / attempted) * 100);
}

function pctColor(p) {
  if (p === null) return undefined;
  return p >= 70 ? 'var(--success)' : p >= 50 ? '#ca8a04' : 'var(--danger)';
}

function displayName(email) {
  if (!email) return 'Student';
  const local = email.split('@')[0];
  return local.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function AccuracyBar({ correct, attempted }) {
  const p = pct(correct, attempted);
  if (p === null) return null;
  const color = pctColor(p);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="dbProgressBar">
        <div className="dbProgressFill" style={{ width: `${p}%`, background: color }} />
      </div>
      <span style={{ color, fontWeight: 600, fontSize: 12, minWidth: 32, textAlign: 'right' }}>{p}%</span>
    </div>
  );
}

function buildSections(domainStats, topicStats) {
  const topicsByDomain = {};
  for (const t of topicStats) {
    if (!topicsByDomain[t.domain_name]) topicsByDomain[t.domain_name] = [];
    topicsByDomain[t.domain_name].push(t);
  }
  const english = { label: 'Reading & Writing', domains: [] };
  const math = { label: 'Math', domains: [] };
  for (const d of domainStats) {
    const section = MATH_CODES.has(d.domain_code) ? math : english;
    section.domains.push({ ...d, topics: topicsByDomain[d.domain_name] || [] });
  }
  return [english, math];
}

function PerfSection({ section, loading }) {
  const [open, setOpen] = useState({});
  const toggle = (name) => setOpen((prev) => ({ ...prev, [name]: !prev[name] }));

  const sectionTotals = section.domains.reduce(
    (acc, d) => ({ correct: acc.correct + d.correct, attempted: acc.attempted + d.attempted }),
    { correct: 0, attempted: 0 }
  );
  const sectionPct = pct(sectionTotals.correct, sectionTotals.attempted);

  return (
    <div className="card dbPerfCard">
      <div className="dbPerfCardHeader">
        <span className="h2">{section.label}</span>
        {sectionPct !== null && (
          <span className="dbSectionPct" style={{ color: pctColor(sectionPct) }}>{sectionPct}%</span>
        )}
      </div>

      {loading ? (
        <p className="muted small">Loading…</p>
      ) : !section.domains.length ? (
        <p className="muted small">No data yet — start practicing to see your stats.</p>
      ) : (
        <div className="dbDomainList">
          {section.domains.map((domain) => {
            const isOpen = open[domain.domain_name];
            const hasTopics = domain.topics.length > 0;
            return (
              <div key={domain.domain_name} className="dbDomainBlock">
                <div
                  className="dbDomainRow"
                  onClick={() => hasTopics && toggle(domain.domain_name)}
                  style={{ cursor: hasTopics ? 'pointer' : 'default' }}
                >
                  <div className="dbDomainLeft">
                    <span className={`dbChevron${hasTopics ? '' : ' invisible'}`}>
                      {isOpen ? '▾' : '▸'}
                    </span>
                    <span className="dbDomainName">{domain.domain_name}</span>
                  </div>
                  <span className="dbRowCount">{domain.correct}/{domain.attempted}</span>
                  <div className="dbBarCell">
                    <AccuracyBar correct={domain.correct} attempted={domain.attempted} />
                  </div>
                </div>

                {isOpen && hasTopics && (
                  <div className="dbTopicList">
                    {domain.topics.map((topic) => (
                      <div key={topic.skill_name} className="dbTopicRow">
                        <span className="dbTopicName">{topic.skill_name}</span>
                        <span className="dbRowCount">{topic.correct}/{topic.attempted}</span>
                        <div className="dbBarCell">
                          <AccuracyBar correct={topic.correct} attempted={topic.attempted} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function DashboardClient({ email }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const overallPct = data ? pct(data.totalCorrect, data.totalAttempted) : null;
  const sections = data
    ? buildSections(data.domainStats, data.topicStats)
    : [{ label: 'Reading & Writing', domains: [] }, { label: 'Math', domains: [] }];

  return (
    <main className="container dbMain">

      {/* ── Banner ── */}
      <div className="card dbBanner">
        <div className="dbBannerText">
          <div className="dbBannerGreeting">{timeGreeting()}, {displayName(email)}</div>
          <p className="muted small" style={{ margin: 0 }}>Ready to practice? Let's go.</p>
        </div>
        <div className="dbBannerActions">
          <Link href="/practice" className="btn primary">Continue Practicing</Link>
          <Link href="/practice-test" className="btn secondary">Take a Test</Link>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="dbStatsRow">
        <div className="card dbStatCard">
          <div className="dbStatValue">{data?.totalAttempted ?? '—'}</div>
          <div className="dbStatLabel">Questions Attempted</div>
        </div>
        <div className="card dbStatCard">
          <div className="dbStatValue" style={{ color: 'var(--success)' }}>
            {data?.totalCorrect ?? '—'}
          </div>
          <div className="dbStatLabel">Correct</div>
        </div>
        <div className="card dbStatCard">
          <div className="dbStatValue" style={{ color: pctColor(overallPct) }}>
            {overallPct !== null ? `${overallPct}%` : '—'}
          </div>
          <div className="dbStatLabel">Overall Accuracy</div>
        </div>
      </div>

      {/* ── Performance: R&W | Math ── */}
      <div className="dbPerfGrid">
        {sections.map((section) => (
          <PerfSection key={section.label} section={section} loading={loading} />
        ))}
      </div>

      {/* ── Bottom row: Practice Tests + Recent Activity ── */}
      <div className="dbBottomRow">

        {/* Practice tests CTA */}
        <div className="card dbTestCard">
          <div className="h2" style={{ marginBottom: 8 }}>Practice Tests</div>
          <p className="muted small" style={{ marginTop: 0 }}>
            Full-length, adaptive SAT tests with timed modules, score reports, and question-by-question review.
          </p>
          <Link href="/practice-test" className="btn secondary dbTestBtn">View Practice Tests</Link>
        </div>

        {/* Recent activity */}
        <div className="card dbActivityCard">
          <div className="h2" style={{ marginBottom: 8 }}>Recent Practice</div>
          {loading ? (
            <p className="muted small">Loading…</p>
          ) : error ? (
            <p className="muted small">{error}</p>
          ) : !data?.recentActivity?.length ? (
            <p className="muted small">No questions attempted yet.</p>
          ) : (
            <div className="dbActivityList">
              {data.recentActivity.map((item) => (
                <Link
                  key={item.question_id}
                  href={`/practice/${item.question_id}`}
                  className="dbActivityItem"
                >
                  <div className={`dbActivityDot ${item.last_is_correct ? 'correct' : 'incorrect'}`}>
                    {item.last_is_correct ? '✓' : '✗'}
                  </div>
                  <div className="dbActivityInfo">
                    <span className="dbActivityTopic">{item.skill_name}</span>
                    <span className="muted small"> · {item.domain_name}</span>
                    {item.difficulty && <span className="muted small"> · D{item.difficulty}</span>}
                  </div>
                  <div className="dbActivityDate muted small">{formatDate(item.last_attempt_at)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
