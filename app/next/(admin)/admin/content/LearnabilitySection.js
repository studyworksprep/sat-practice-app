'use client';

import { useActionState, useMemo, useState } from 'react';
import { saveSkillLearnability } from './actions';

export function LearnabilitySection({ skills }) {
  // Key by skill_code. Store the display value; diff against initial.
  const [values, setValues] = useState(() =>
    Object.fromEntries(skills.map((s) => [s.skill_code, s.learnability])),
  );
  const [state, formAction, pending] = useActionState(saveSkillLearnability, null);

  const changed = useMemo(
    () => skills.filter((s) => values[s.skill_code] !== s.learnability),
    [values, skills],
  );

  function updateValue(code, v) {
    setValues((prev) => ({ ...prev, [code]: Number(v) }));
  }

  return (
    <>
      <p style={S.hint}>
        Rate each skill 1 (hardest to improve) to 10 (easiest to improve). Used
        by the Opportunity Index.
      </p>

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Domain</th>
              <th style={S.th}>Skill</th>
              <th style={{ ...S.th, width: 180 }}>Learnability</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((s) => {
              const dirty = values[s.skill_code] !== s.learnability;
              return (
                <tr key={s.skill_code} style={dirty ? S.trDirty : undefined}>
                  <td style={S.tdMuted}>{s.domain_name ?? '—'}</td>
                  <td style={S.td}>{s.skill_name ?? s.skill_code}</td>
                  <td style={S.td}>
                    <div style={S.sliderRow}>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={values[s.skill_code]}
                        onChange={(e) => updateValue(s.skill_code, e.target.value)}
                        style={S.slider}
                      />
                      <span style={S.sliderVal}>{values[s.skill_code]}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {skills.length === 0 && (
              <tr><td colSpan={3} style={S.empty}>No skills found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={formAction} style={S.saveRow}>
        <input
          type="hidden"
          name="changes_json"
          value={JSON.stringify(
            changed.map((s) => ({ skill_code: s.skill_code, learnability: values[s.skill_code] })),
          )}
        />
        <button type="submit" disabled={pending || changed.length === 0} style={S.btn}>
          {pending ? 'Saving…' : `Save${changed.length ? ` (${changed.length})` : ''}`}
        </button>
        {changed.length > 0 && <span style={S.hint}>{changed.length} unsaved</span>}
        {state?.ok && !pending && changed.length === 0 && (
          <span style={S.ok}>Saved.</span>
        )}
        {state?.ok === false && !pending && <span style={S.err}>{state.error}</span>}
      </form>
    </>
  );
}

const S = {
  hint: { fontSize: '0.8rem', color: '#6b7280', marginTop: 0, marginBottom: '0.75rem' },
  tableWrap: { overflow: 'auto', maxHeight: 420, border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: '0.75rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th: { textAlign: 'left', padding: '0.4rem 0.7rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '0.7rem', textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.025em', position: 'sticky', top: 0 },
  td: { padding: '0.35rem 0.7rem', borderBottom: '1px solid #f3f4f6' },
  tdMuted: { padding: '0.35rem 0.7rem', borderBottom: '1px solid #f3f4f6', color: '#6b7280', fontSize: '0.8rem' },
  trDirty: { background: '#eff6ff' },
  sliderRow: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  slider: { flex: 1, maxWidth: 140 },
  sliderVal: { fontFamily: 'monospace', fontWeight: 600, minWidth: 18, textAlign: 'right' },
  empty: { padding: '1rem', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' },
  saveRow: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  btn: { padding: '0.45rem 0.9rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  ok: { color: '#166534', fontSize: '0.85rem' },
  err: { color: '#991b1b', fontSize: '0.85rem' },
};
