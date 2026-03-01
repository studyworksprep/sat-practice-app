'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const PAGE_SIZE = 25;

function toQS(obj) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === null || v === undefined || v === '') continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}

function Badge({ children, tone = 'default' }) {
  return <span className={`qbBadge ${tone}`}>{children}</span>;
}

export default function QuestionBankPage() {
  const router = useRouter();

  // Filter options
  const [domains, setDomains] = useState([]);
  const [topics, setTopics] = useState([]);

  // Filters (match your schema fields)
  const [program, setProgram] = useState('SAT');
  const [domainName, setDomainName] = useState('');
  const [topicName, setTopicName] = useState('');
  const [difficulty, setDifficulty] = useState(''); // 1-3
  const [scoreBand, setScoreBand] = useState('');   // 1-7
  const [questionType, setQuestionType] = useState(''); // mcq/spr
  const [statusFilter, setStatusFilter] = useState(''); // optional: unattempted/done/marked/correct/incorrect

  const [sort, setSort] = useState('difficulty'); // difficulty|score_band|topic
  const [page, setPage] = useState(1);

  // Results
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState([]);
  const [firstQuestionId, setFirstQuestionId] = useState(null);

  // Load domains list
  useEffect(() => {
    let alive = true;
    fetch('/api/filters')
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setDomains(Array.isArray(j?.domains) ? j.domains : []);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Load topics list when domain changes (your /api/filters expects domain_name)
  useEffect(() => {
    let alive = true;
    setTopicName('');
    setTopics([]);
    if (!domainName) return;

    fetch(`/api/filters?${toQS({ domain: domainName })}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setTopics(Array.isArray(j?.topics) ? j.topics : []);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [domainName]);

  const queryParams = useMemo(() => {
    return {
      program,
      domain_name: domainName,
      skill_name: topicName,
      difficulty,
      score_band: scoreBand,
      question_type: questionType,
      status: statusFilter,
      sort,
      page,
      page_size: PAGE_SIZE,
    };
  }, [program, domainName, topicName, difficulty, scoreBand, questionType, statusFilter, sort, page]);

  async function loadResults() {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(`/api/questions?${toQS(queryParams)}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Failed to load questions.');

      setTotal(j?.total ?? 0);
      setItems(Array.isArray(j?.items) ? j.items : []);
      setFirstQuestionId(j?.first_question_id ?? null);
    } catch (e) {
      setErr(e?.message || 'Failed to load.');
      setTotal(0);
      setItems([]);
      setFirstQuestionId(null);
    } finally {
      setLoading(false);
    }
  }

  // Reload on filter/sort/page changes
  useEffect(() => { loadResults(); }, [queryParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));

  function resetAndGo() {
    setPage(1);
    // results reload via effect
  }

  async function startPractice() {
    // If the API returned a starting question, jump straight into /practice/[questionId]
    // (You already have app/practice/[questionId]/page.js per your tree screenshot.)
    if (!firstQuestionId) return;

    // Pass filters along as query params (optional, but useful later for “neighbors”/session continuation)
    const qs = toQS({
      program,
      domain_name: domainName,
      skill_name: topicName,
      difficulty,
      score_band: scoreBand,
      question_type: questionType,
      sort,
    });

    router.push(`/practice/${firstQuestionId}${qs ? `?${qs}` : ''}`);
  }

  return (
    <main className="container">
      <div className="qbHeader">
        <div>
          <div className="h1">Question Bank</div>
          <p className="muted" style={{ marginTop: 6 }}>
            Filter the bank, review what matches, then click <span className="kbd">Start Practice</span>.
          </p>
        </div>

        <div className="qbHeaderActions">
          <button className="btn" disabled={!firstQuestionId || loading} onClick={startPractice}>
            Start Practice
          </button>
        </div>
      </div>

      <div className="qbLayout">
        {/* Sidebar */}
        <aside className="qbSidebar card">
          <div className="h2" style={{ marginTop: 0 }}>Filters</div>

          <label className="qbLabel">Program</label>
          <input className="input" value={program} onChange={(e) => { setProgram(e.target.value); resetAndGo(); }} />

          <label className="qbLabel">Domain</label>
          <select
            className="input"
            value={domainName}
            onChange={(e) => { setDomainName(e.target.value); resetAndGo(); }}
          >
            <option value="">All domains</option>
            {domains.map((d) => (
              <option key={`${d.domain_name}||${d.domain_code || ''}`} value={d.domain_name}>
                {d.domain_name}
              </option>
            ))}
          </select>

          <label className="qbLabel">Topic</label>
          <select
            className="input"
            value={topicName}
            onChange={(e) => { setTopicName(e.target.value); resetAndGo(); }}
            disabled={!domainName}
          >
            <option value="">{domainName ? 'All topics' : 'Select a domain first'}</option>
            {topics.map((t) => (
              <option key={`${t.skill_name}||${t.skill_code || ''}`} value={t.skill_name}>
                {t.skill_name}
              </option>
            ))}
          </select>

          <div className="qbGrid2">
            <div>
              <label className="qbLabel">Difficulty</label>
              <select
                className="input"
                value={difficulty}
                onChange={(e) => { setDifficulty(e.target.value); resetAndGo(); }}
              >
                <option value="">Any</option>
                <option value="1">1 (Easy)</option>
                <option value="2">2 (Medium)</option>
                <option value="3">3 (Hard)</option>
              </select>
            </div>
            <div>
              <label className="qbLabel">Score band</label>
              <select
                className="input"
                value={scoreBand}
                onChange={(e) => { setScoreBand(e.target.value); resetAndGo(); }}
              >
                <option value="">Any</option>
                {Array.from({ length: 7 }).map((_, i) => (
                  <option key={i + 1} value={String(i + 1)}>{i + 1}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="qbLabel">Question type</label>
          <select
            className="input"
            value={questionType}
            onChange={(e) => { setQuestionType(e.target.value); resetAndGo(); }}
          >
            <option value="">Any</option>
            <option value="mcq">MCQ</option>
            <option value="spr">SPR</option>
          </select>

          <label className="qbLabel">Status (optional)</label>
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); resetAndGo(); }}
          >
            <option value="">Any</option>
            <option value="unattempted">Unattempted</option>
            <option value="done">Done</option>
            <option value="marked">Marked for review</option>
            <option value="correct">Last attempt correct</option>
            <option value="incorrect">Last attempt incorrect</option>
          </select>

          <hr />

          <label className="qbLabel">Sort</label>
          <select
            className="input"
            value={sort}
            onChange={(e) => { setSort(e.target.value); resetAndGo(); }}
          >
            <option value="difficulty">Difficulty</option>
            <option value="score_band">Score band</option>
            <option value="topic">Topic</option>
          </select>

          <button
            className="btn secondary"
            onClick={() => {
              setDomainName('');
              setTopicName('');
              setDifficulty('');
              setScoreBand('');
              setQuestionType('');
              setStatusFilter('');
              setSort('difficulty');
              setPage(1);
            }}
          >
            Reset
          </button>
        </aside>

        {/* Results */}
        <section className="qbResults">
          <div className="card">
            <div className="qbResultsTop">
              <div className="muted">
                {loading ? 'Loading…' : `${total.toLocaleString()} match${total === 1 ? '' : 'es'}`}
                {total > 0 ? ` • Page ${page} of ${totalPages}` : ''}
              </div>

              <div className="qbPager">
                <button className="btn secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Prev
                </button>
                <button className="btn secondary" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Next
                </button>
              </div>
            </div>

            {err ? (
              <p className="muted" style={{ color: '#b91c1c' }}>{err}</p>
            ) : null}

            <div className="qbRows">
              {items.map((row) => {
                const statusTone =
                  row?.marked_for_review ? 'warn'
                  : row?.is_done && row?.last_is_correct === true ? 'ok'
                  : row?.is_done && row?.last_is_correct === false ? 'bad'
                  : 'default';

                return (
                  <div className="qbRow" key={row.question_id}>
                    <div className="qbRowMain">
                      <div className="qbRowTitle">
                        <span className="kbd">{row.question_id.slice(0, 8)}</span>
                        {row.question_type ? <Badge tone="muted">{String(row.question_type).toUpperCase()}</Badge> : null}
                        {row.domain_name ? <Badge>{row.domain_name}</Badge> : null}
                        {row.skill_name ? <Badge tone="muted">{row.skill_name}</Badge> : null}
                      </div>

                      <div className="qbRowMeta muted">
                        Difficulty: {row.difficulty ?? '—'} • Score band: {row.score_band ?? '—'}
                      </div>
                    </div>

                    <div className="qbRowRight">
                      {row.marked_for_review ? <Badge tone="warn">Marked</Badge> : null}
                      {row.is_done ? (
                        <Badge tone={statusTone}>
                          {row.last_is_correct === true ? 'Correct' : row.last_is_correct === false ? 'Incorrect' : 'Done'}
                        </Badge>
                      ) : (
                        <Badge tone="muted">Unattempted</Badge>
                      )}
                    </div>
                  </div>
                );
              })}

              {!loading && items.length === 0 ? (
                <p className="muted" style={{ marginTop: 12 }}>
                  No matches. Try widening filters.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
