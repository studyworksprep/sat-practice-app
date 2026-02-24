'use client';

import { useEffect, useMemo, useState } from 'react';

const DEFAULTS = {
  difficulty: '',
  score_bands: [],
  domain: '',
  topic: '',
  marked_only: false,
};

export default function Filters({ initial = {}, onChange }) {
  const [state, setState] = useState({ ...DEFAULTS, ...initial });
  const [domains, setDomains] = useState([]);
  const [topics, setTopics] = useState([]);
  const topicEnabled = Boolean(state.domain);

  useEffect(() => {
    onChange?.(state);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Load domain dropdown options
    (async () => {
      const res = await fetch('/api/filters');
      const json = await res.json();
      if (res.ok) setDomains(json.domains || []);
    })();
  }, []);

  useEffect(() => {
    // Load topics for selected domain
    (async () => {
      if (!state.domain) {
        setTopics([]);
        setState((prev) => ({ ...prev, topic: '' }));
        return;
      }
      const res = await fetch('/api/filters?domain=' + encodeURIComponent(state.domain));
      const json = await res.json();
      if (res.ok) setTopics(json.topics || []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.domain]);

  function set(k, v) {
    setState(prev => ({ ...prev, [k]: v }));
  }

  function toggleScoreBand(band) {
    setState(prev => {
      const setBands = new Set(prev.score_bands || []);
      if (setBands.has(band)) setBands.delete(band);
      else setBands.add(band);
      const next = Array.from(setBands).sort((a,b)=>a-b);
      return { ...prev, score_bands: next };
    });
  }

  return (
    <div className="card">
      <div className="h2">Filters</div>

      <div className="row">
        <div className="col">
          <label>Difficulty (1–3)</label>
          <select className="input" value={state.difficulty} onChange={e => set('difficulty', e.target.value)}>
            <option value="">Any</option>
            <option value="1">1 (Easy)</option>
            <option value="2">2 (Medium)</option>
            <option value="3">3 (Hard)</option>
          </select>
        </div>

        <div className="col">
          <label>Score bands (multi-select)</label>
          <div className="chips" aria-label="Score bands">
            {[1,2,3,4,5,6,7].map(n => {
              const on = (state.score_bands || []).includes(n);
              return (
                <label key={n} className={'chip' + (on ? ' on' : '')}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleScoreBand(n)}
                  />
                  <span>{n}</span>
                </label>
              );
            })}
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>
            Leave all unchecked to include any score band.
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 2 }}>
        <div className="col">
          <label>Domain</label>
          <select className="input" value={state.domain} onChange={e => set('domain', e.target.value)}>
            <option value="">Select a domain…</option>
            {domains.map(d => (
              <option key={(d.domain_name || '') + (d.domain_code || '')} value={d.domain_name}>
                {d.domain_name}
              </option>
            ))}
          </select>
        </div>

        <div className="col">
          <label>Topic (enabled after domain)</label>
          <select
            className="input"
            value={state.topic}
            onChange={e => set('topic', e.target.value)}
            disabled={!topicEnabled}
            style={!topicEnabled ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
          >
            <option value="">{topicEnabled ? 'Select a topic…' : 'Select a domain first'}</option>
            {topics.map(t => (
              <option key={(t.skill_name || '') + (t.skill_code || '')} value={t.skill_name}>
                {t.skill_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
        <label style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={state.marked_only}
            onChange={e => set('marked_only', e.target.checked)}
            style={{ marginRight: 8 }}
          />
          Show only marked-for-review
        </label>
      </div>
    </div>
  );
}
