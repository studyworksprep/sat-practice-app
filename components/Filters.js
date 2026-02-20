'use client';

import { useEffect, useMemo, useState } from 'react';

const DEFAULTS = {
  difficulty: '',
  score_band: '',
  domain: '',
  skill: '',
  marked_only: false,
};

export default function Filters({ initial = {}, onChange }) {
  const [state, setState] = useState({ ...DEFAULTS, ...initial });

  useEffect(() => {
    onChange?.(state);
  }, [state]);

  function set(k, v) {
    setState(prev => ({ ...prev, [k]: v }));
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
          <label>Score Band (1–7)</label>
          <select className="input" value={state.score_band} onChange={e => set('score_band', e.target.value)}>
            <option value="">Any</option>
            {[1,2,3,4,5,6,7].map(n => <option key={n} value={String(n)}>{n}</option>)}
          </select>
        </div>
        <div className="col">
          <label>Domain (text contains)</label>
          <input className="input" value={state.domain} onChange={e => set('domain', e.target.value)} placeholder="e.g., Craft and Structure" />
        </div>
        <div className="col">
          <label>Skill / Subtopic (text contains)</label>
          <input className="input" value={state.skill} onChange={e => set('skill', e.target.value)} placeholder="e.g., Transitions" />
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
