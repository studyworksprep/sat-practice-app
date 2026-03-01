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

  function set(k, v) {
    setState((prev) => ({ ...prev, [k]: v }));
  }

  function toggleDifficulty(n) {
    setState((prev) => {
      const next = prev.difficulties.includes(n)
        ? prev.difficulties.filter((d) => d !== n)
        : [...prev.difficulties, n].sort((a, b) => a - b);
      return { ...prev, difficulties: next };
    });
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
      if (isDomainOn) {
        return { ...prev, domains: prev.domains.filter((d) => d !== domainName) };
      }
      // Selecting a domain: add it and drop any individually-selected topics it covers
      return {
        ...prev,
        domains: [...prev.domains, domainName],
        topics: prev.topics.filter((t) => !domainTopicNames.includes(t)),
      };
    });
  }

  function toggleTopic(domainName, skillName) {
    setState((prev) => {
      // If the whole domain is selected, ignore individual topic clicks
      if (prev.domains.includes(domainName)) return prev;
      const isOn = prev.topics.includes(skillName);
      return {
        ...prev,
        topics: isOn ? prev.topics.filter((t) => t !== skillName) : [...prev.topics, skillName],
      };
    });
  }

  // Group topics by domain, build section tree
  const sections = useMemo(() => {
    const topicsByDomain = {};
    for (const t of allTopics) {
      if (!topicsByDomain[t.domain_name]) topicsByDomain[t.domain_name] = [];
      topicsByDomain[t.domain_name].push(t);
    }

    const math = allDomains
      .filter((d) => MATH_CODES.has(d.domain_code))
      .sort((a, b) => MATH_ORDER.indexOf(a.domain_code) - MATH_ORDER.indexOf(b.domain_code))
      .map((d) => ({ ...d, topics: topicsByDomain[d.domain_name] || [] }));

    const rw = allDomains
      .filter((d) => RW_CODES.has(d.domain_code))
      .sort((a, b) => RW_ORDER.indexOf(a.domain_code) - RW_ORDER.indexOf(b.domain_code))
      .map((d) => ({ ...d, topics: topicsByDomain[d.domain_name] || [] }));

    const other = allDomains
      .filter((d) => !MATH_CODES.has(d.domain_code) && !RW_CODES.has(d.domain_code))
      .sort((a, b) => String(a.domain_name).localeCompare(String(b.domain_name)))
      .map((d) => ({ ...d, topics: topicsByDomain[d.domain_name] || [] }));

    return [
      { label: 'Math', domains: math },
      { label: 'Reading & Writing', domains: rw },
      ...(other.length ? [{ label: 'Other', domains: other }] : []),
    ];
  }, [allDomains, allTopics]);

  return (
    <div className="card">
      <div className="h2">Filters</div>

      {/* Difficulty */}
      <label>Difficulty</label>
      <div className="chips">
        {[1, 2, 3].map((n) => {
          const on = state.difficulties.includes(n);
          return (
            <label key={n} className={`chip sm${on ? ' on' : ''}`}>
              <input type="checkbox" checked={on} onChange={() => toggleDifficulty(n)} />
              <span>D{n}</span>
            </label>
          );
        })}
      </div>

      {/* Score band */}
      <label style={{ marginTop: 12 }}>Score Band</label>
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
      <div className="muted small" style={{ marginTop: 4 }}>Leave all unchecked for any.</div>

      {/* Domain & Topic tree */}
      <label style={{ marginTop: 14 }}>Domain &amp; Topic</label>
      {sections.map((section) => (
        <div key={section.label} style={{ marginBottom: 12 }}>
          <div className="filterSectionLabel">{section.label}</div>
          {section.domains.map((domain) => {
            const domainOn = state.domains.includes(domain.domain_name);
            const domainTopicNames = domain.topics.map((t) => t.skill_name);
            return (
              <div key={domain.domain_name} style={{ marginBottom: 8 }}>
                <label className={`chip${domainOn ? ' on' : ''}`}>
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
                      const coveredByDomain = domainOn;
                      const topicOn = coveredByDomain || state.topics.includes(topic.skill_name);
                      return (
                        <label
                          key={topic.skill_name}
                          className={`chip sm${topicOn ? ' on' : ''}`}
                          style={coveredByDomain ? { opacity: 0.65, cursor: 'default' } : undefined}
                        >
                          <input
                            type="checkbox"
                            checked={topicOn}
                            disabled={coveredByDomain}
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
          })}
        </div>
      ))}

      {/* Additional filters */}
      <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <input
            type="checkbox"
            checked={state.wrong_only}
            onChange={(e) => set('wrong_only', e.target.checked)}
          />
          Only wrong answers
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <input
            type="checkbox"
            checked={state.marked_only}
            onChange={(e) => set('marked_only', e.target.checked)}
          />
          Only marked for review
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <input
            type="checkbox"
            checked={state.broken_only}
            onChange={(e) => set('broken_only', e.target.checked)}
          />
          Only flagged as broken
        </label>
      </div>
    </div>
  );
}
