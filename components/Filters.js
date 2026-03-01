'use client';

import { useEffect, useMemo, useState } from 'react';

const DEFAULTS = {
  difficulties: [],
  score_bands: [],
  domains: [],
  topics: [],
  wrong_only: false,
  marked_only: false,
  broken_only: false,
};

const MATH_CODES = new Set(['H', 'P', 'Q', 'S']);
const RW_CODES = new Set(['CAS', 'INI', 'EOI', 'SEC']);
const MATH_ORDER = ['H', 'P', 'Q', 'S'];
const RW_ORDER = ['INI', 'CAS', 'EOI', 'SEC'];

export default function Filters({ initial = {}, onChange }) {
  const [state, setState] = useState({ ...DEFAULTS, ...initial });
  const [allDomains, setAllDomains] = useState([]);
  const [allTopics, setAllTopics] = useState([]);

  useEffect(() => {
    onChange?.(state);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/filters');
      const json = await res.json();
      if (res.ok) {
        setAllDomains(json.domains || []);
        setAllTopics(json.topics || []);
      }
    })();
  }, []);

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
        topics: prev.topics.filter((t) => !domainTopicNames.includes(t)),
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

  function renderDomain(domain) {
    const domainOn = state.domains.includes(domain.domain_name);
    const domainTopicNames = domain.topics.map((t) => t.skill_name);
    return (
      <div key={domain.domain_name} style={{ marginBottom: 8 }}>
        <label className={`domainChip${domainOn ? ' on' : ''}`}>
          <input
            type="checkbox"
            checked={domainOn}
            onChange={() => toggleDomain(domain.domain_name, domainTopicNames)}
          />
          <span>{domain.domain_name}</span>
        </label>

        {domain.topics.length > 0 && (
          <div className="topicChips">
            {domain.topics.map((topic) => {
              const topicOn = domainOn || state.topics.includes(topic.skill_name);
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
      <div className="h2">Filters</div>

      {/* Quick filters — top */}
      <div style={{ display: 'grid', gap: 7, marginBottom: 12 }}>
        {[
          ['marked_only', 'Only marked for review'],
          ['wrong_only',  'Only wrong answers'],
        ].map(([key, label]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 13 }}>
            <input type="checkbox" checked={state[key]} onChange={(e) => set(key, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      {/* Difficulty — one line */}
      <div className="filterInlineRow">
        <span className="filterInlineLabel">Difficulty</span>
        <div className="chips">
          {[[1,'E','Easy'],[2,'M','Medium'],[3,'H','Hard']].map(([n, label, title]) => {
            const on = state.difficulties.includes(n);
            return (
              <label key={n} className={`chip sm${on ? ' on' : ''}`} title={title}>
                <input type="checkbox" checked={on} onChange={() => toggleDifficulty(n)} />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Score Band — one line */}
      <div className="filterInlineRow">
        <span className="filterInlineLabel">Score Band</span>
        <div className="chips">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => {
            const on = (state.score_bands || []).includes(n);
            return (
              <label key={n} className={`chip sm${on ? ' on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => toggleScoreBand(n)} />
                <span>{n}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Domain & Topic — two columns */}
      <div style={{ marginTop: 14, marginBottom: 2 }}>
        <span className="filterSectionLabel" style={{ display: 'block', marginBottom: 8 }}>Domain &amp; Topic</span>
        <div className="filterDomainCols">
          <div>
            <div className="filterSectionLabel">Math</div>
            {mathDomains.map(renderDomain)}
          </div>
          <div>
            <div className="filterSectionLabel">Reading &amp; Writing</div>
            {rwDomains.map(renderDomain)}
          </div>
        </div>
      </div>

      {/* Bottom filter */}
      <div style={{ marginTop: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 13 }}>
          <input type="checkbox" checked={state.broken_only} onChange={(e) => set('broken_only', e.target.checked)} />
          Only flagged as broken
        </label>
      </div>
    </div>
  );
}
