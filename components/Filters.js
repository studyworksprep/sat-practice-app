'use client';

import { useMemo, useEffect, useState } from 'react';

const DEFAULTS = {
  difficulties: [],
  score_bands: [],
  domains: [],
  topics: [],
  wrong_only: false,
  marked_only: false,
  broken_only: false,
};

const MATH_CODES  = new Set(['H', 'P', 'Q', 'S']);
const RW_CODES    = new Set(['CAS', 'INI', 'EOI', 'SEC']);
const MATH_ORDER  = ['H', 'P', 'Q', 'S'];
const RW_ORDER    = ['INI', 'CAS', 'EOI', 'SEC'];

export default function Filters({ initial = {}, onChange, onStartSession }) {
  const [state,     setState]     = useState({ ...DEFAULTS, ...initial });
  const [allDomains, setAllDomains] = useState([]);
  const [allTopics,  setAllTopics]  = useState([]);
  const [counts,     setCounts]     = useState({});
  const [randomize,  setRandomize]  = useState(false);
  const [starting,   setStarting]   = useState(false);

  // Propagate state changes to parent
  useEffect(() => { onChange?.(state); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load domain/topic lists once
  useEffect(() => {
    (async () => {
      const res  = await fetch('/api/filters');
      const json = await res.json();
      if (res.ok) {
        setAllDomains(json.domains || []);
        setAllTopics(json.topics  || []);
      }
    })();
  }, []);

  // Re-fetch counts whenever non-domain/topic filters change (fires on mount for unfiltered totals)
  useEffect(() => {
    const p = new URLSearchParams();
    if (state.difficulties.length) p.set('difficulties', state.difficulties.join(','));
    if (state.score_bands.length)  p.set('score_bands',  state.score_bands.join(','));
    if (state.wrong_only)          p.set('wrong_only',   'true');
    if (state.marked_only)         p.set('marked_only',  'true');
    if (state.broken_only)         p.set('broken_only',  'true');

    fetch('/api/domain-counts?' + p.toString())
      .then((r) => r.json())
      .then((data) => { if (data && !data.error) setCounts(data); })
      .catch(() => {});
  }, [state.difficulties, state.score_bands, state.wrong_only, state.marked_only, state.broken_only]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(k, v) { setState((prev) => ({ ...prev, [k]: v })); }

  function toggleDifficulty(n) {
    setState((prev) => ({
      ...prev,
      difficulties: prev.difficulties.includes(n)
        ? prev.difficulties.filter((d) => d !== n)
        : [...prev.difficulties, n].sort((a, b) => a - b),
    }));
  }

  function toggleScoreBand(band) {
    setState((prev) => {
      const s = new Set(prev.score_bands || []);
      s.has(band) ? s.delete(band) : s.add(band);
      return { ...prev, score_bands: Array.from(s).sort((a, b) => a - b) };
    });
  }

  function toggleDomain(domainName, domainTopicNames) {
    setState((prev) => {
      const isDomainOn = prev.domains.includes(domainName);
      if (isDomainOn) return { ...prev, domains: prev.domains.filter((d) => d !== domainName) };
      return {
        ...prev,
        domains: [...prev.domains, domainName],
        topics:  prev.topics.filter((t) => !domainTopicNames.includes(t)),
      };
    });
  }

  function toggleTopic(domainName, skillName) {
    setState((prev) => {
      if (prev.domains.includes(domainName)) return prev;
      const isOn = prev.topics.includes(skillName);
      return { ...prev, topics: isOn ? prev.topics.filter((t) => t !== skillName) : [...prev.topics, skillName] };
    });
  }

  // Toggle all domains in a category (Math or R&W)
  function toggleCategory(domainList) {
    const names     = domainList.map((d) => d.domain_name);
    const allOn     = names.length > 0 && names.every((n) => state.domains.includes(n));
    if (allOn) {
      setState((prev) => ({ ...prev, domains: prev.domains.filter((d) => !names.includes(d)) }));
    } else {
      const allTopicNames = domainList.flatMap((d) => d.topics.map((t) => t.skill_name));
      setState((prev) => ({
        ...prev,
        domains: [...new Set([...prev.domains, ...names])],
        topics:  prev.topics.filter((t) => !allTopicNames.includes(t)),
      }));
    }
  }

  // Build Math and R&W domain lists with their topics
  const { mathDomains, rwDomains } = useMemo(() => {
    const topicsByDomain = {};
    for (const t of allTopics) {
      if (!topicsByDomain[t.domain_name]) topicsByDomain[t.domain_name] = [];
      topicsByDomain[t.domain_name].push(t);
    }
    const attach = (d) => ({ ...d, topics: topicsByDomain[d.domain_name] || [] });

    return {
      mathDomains: allDomains
        .filter((d) => MATH_CODES.has(d.domain_code))
        .sort((a, b) => MATH_ORDER.indexOf(a.domain_code) - MATH_ORDER.indexOf(b.domain_code))
        .map(attach),
      rwDomains: allDomains
        .filter((d) => RW_CODES.has(d.domain_code))
        .sort((a, b) => RW_ORDER.indexOf(a.domain_code) - RW_ORDER.indexOf(b.domain_code))
        .map(attach),
    };
  }, [allDomains, allTopics]);

  // Category-level counts (sum of domain counts; undefined until counts load)
  const mathTotal = useMemo(() => {
    if (!Object.keys(counts).length) return undefined;
    return mathDomains.reduce((s, d) => s + (counts[d.domain_name]?.count ?? 0), 0);
  }, [mathDomains, counts]);

  const rwTotal = useMemo(() => {
    if (!Object.keys(counts).length) return undefined;
    return rwDomains.reduce((s, d) => s + (counts[d.domain_name]?.count ?? 0), 0);
  }, [rwDomains, counts]);

  // Is at least one filter active? (enables the Start button)
  const hasFilter =
    state.difficulties.length > 0 ||
    state.score_bands.length  > 0 ||
    state.domains.length      > 0 ||
    state.topics.length       > 0 ||
    state.wrong_only || state.marked_only || state.broken_only;

  async function handleStart() {
    if (!hasFilter || starting) return;
    setStarting(true);
    try {
      await onStartSession?.(state, randomize);
    } finally {
      setStarting(false);
    }
  }

  function renderCategory(label, domainList, total, colorClass) {
    const names = domainList.map((d) => d.domain_name);
    const allOn = names.length > 0 && names.every((n) => state.domains.includes(n));
    return (
      <label className={`categoryChip ${colorClass}${allOn ? ' on' : ''}`}>
        <input type="checkbox" checked={allOn} onChange={() => toggleCategory(domainList)} />
        <span style={{ flex: 1 }}>{label}</span>
        {total !== undefined && <span className="filterCount">{total}</span>}
      </label>
    );
  }

  function renderDomain(domain) {
    const colorClass       = MATH_CODES.has(domain.domain_code) ? 'math' : 'rw';
    const domainOn         = state.domains.includes(domain.domain_name);
    const domainTopicNames = domain.topics.map((t) => t.skill_name);
    const domainCount      = counts[domain.domain_name]?.count;

    return (
      <div key={domain.domain_name} style={{ marginBottom: 8 }}>
        <label className={`domainChip ${colorClass}${domainOn ? ' on' : ''}`}>
          <input
            type="checkbox"
            checked={domainOn}
            onChange={() => toggleDomain(domain.domain_name, domainTopicNames)}
          />
          <span style={{ flex: 1 }}>{domain.domain_name}</span>
          {domainCount !== undefined && <span className="filterCount">{domainCount}</span>}
        </label>

        {domain.topics.length > 0 && (
          <div className="topicChips">
            {domain.topics.map((topic) => {
              const topicOn    = domainOn || state.topics.includes(topic.skill_name);
              const topicCount = counts[domain.domain_name]?.topics?.[topic.skill_name];
              return (
                <label
                  key={topic.skill_name}
                  className={`chip sm${topicOn ? ' on' : ''}`}
                  style={domainOn ? { opacity: 0.6, cursor: 'default' } : undefined}
                >
                  <input
                    type="checkbox"
                    checked={topicOn}
                    disabled={domainOn}
                    onChange={() => toggleTopic(domain.domain_name, topic.skill_name)}
                  />
                  <span>{topic.skill_name}</span>
                  {topicCount !== undefined && <span className="filterCount">{topicCount}</span>}
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      {/* Card header: title left, randomize + start button right */}
      <div className="filterCardHeader">
        <div className="h2" style={{ margin: 0 }}>Filters</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <label className="filterCheck">
            <input type="checkbox" checked={randomize} onChange={(e) => setRandomize(e.target.checked)} />
            Randomize question order
          </label>
          <button
            className="btn primary"
            disabled={!hasFilter || starting}
            onClick={handleStart}
          >
            {starting ? 'Loading…' : 'Start Practice Session'}
          </button>
        </div>
      </div>

      {/* Horizontal top bar: quick filters | difficulty | score band */}
      <div className="filterBar">
        <div className="filterBarSection">
          {[
            ['marked_only', 'Only marked for review'],
            ['wrong_only',  'Only wrong answers'],
            ['broken_only', 'Only flagged as broken'],
          ].map(([key, label]) => (
            <label key={key} className="filterCheck">
              <input type="checkbox" checked={state[key]} onChange={(e) => set(key, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>

        <div className="filterBarSection">
          <span className="filterSectionLabel">Difficulty</span>
          <div className="chips">
            {[[1,'E','Easy'],[2,'M','Medium'],[3,'H','Hard']].map(([n, label, title]) => {
              const on = state.difficulties.includes(n);
              const diffClass = n === 1 ? 'diff-easy' : n === 2 ? 'diff-medium' : 'diff-hard';
              return (
                <label key={n} className={`chip sm ${diffClass}${on ? ' on' : ''}`} title={title}>
                  <input type="checkbox" checked={on} onChange={() => toggleDifficulty(n)} />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="filterBarSection">
          <span className="filterSectionLabel">Score Band</span>
          <div className="chips">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => {
              const on = (state.score_bands || []).includes(n);
              const bandClass = n <= 3 ? 'band-low' : n <= 5 ? 'band-mid' : 'band-high';
              return (
                <label key={n} className={`chip sm ${bandClass}${on ? ' on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => toggleScoreBand(n)} />
                  <span>{n}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Domain & Topic — two columns with selectable category headers */}
      <div className="filterDomainCols">
        <div>
          {renderCategory('Math', mathDomains, mathTotal, 'math')}
          {mathDomains.map(renderDomain)}
        </div>
        <div>
          {renderCategory('Reading & Writing', rwDomains, rwTotal, 'rw')}
          {rwDomains.map(renderDomain)}
        </div>
      </div>
    </div>
  );
}
