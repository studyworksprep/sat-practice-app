'use client';

import { useActionState, useMemo, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import { saveSkillLearnability } from './actions';
import s from '../../forms.module.css';

export function LearnabilitySection({ skills }) {
  // Key by skill_code. Store the display value; diff against initial.
  const [values, setValues] = useState(() =>
    Object.fromEntries(skills.map((sk) => [sk.skill_code, sk.learnability])),
  );
  const [state, formAction, pending] = useActionState(saveSkillLearnability, null);

  const changed = useMemo(
    () => skills.filter((sk) => values[sk.skill_code] !== sk.learnability),
    [values, skills],
  );

  function updateValue(code, v) {
    setValues((prev) => ({ ...prev, [code]: Number(v) }));
  }

  return (
    <>
      <p className={s.formHint}>
        Rate each skill 1 (hardest to improve) to 10 (easiest to improve). Used
        by the Opportunity Index.
      </p>

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.th}>Domain</th>
              <th className={s.th}>Skill</th>
              <th className={s.th} style={{ width: 180 }}>Learnability</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((sk) => {
              const dirty = values[sk.skill_code] !== sk.learnability;
              const rowCls = dirty ? s.trDirty : undefined;
              return (
                <tr key={sk.skill_code} className={rowCls}>
                  <td className={s.tdMuted}>{sk.domain_name ?? '—'}</td>
                  <td className={s.td}>{sk.skill_name ?? sk.skill_code}</td>
                  <td className={s.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={values[sk.skill_code]}
                        onChange={(e) => updateValue(sk.skill_code, e.target.value)}
                        style={{ flex: 1, maxWidth: 140 }}
                      />
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        minWidth: 18,
                        textAlign: 'right',
                      }}>
                        {values[sk.skill_code]}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {skills.length === 0 && (
              <tr>
                <td colSpan={3} className={s.empty}>No skills found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={formAction} className={s.row}>
        <input
          type="hidden"
          name="changes_json"
          value={JSON.stringify(
            changed.map((sk) => ({
              skill_code: sk.skill_code,
              learnability: values[sk.skill_code],
            })),
          )}
        />
        <Button
          type="submit"
          disabled={pending || changed.length === 0}
          size="sm"
        >
          {pending ? 'Saving…' : `Save${changed.length ? ` (${changed.length})` : ''}`}
        </Button>
        {changed.length > 0 && (
          <span className={s.muted}>{changed.length} unsaved</span>
        )}
        {state?.ok && !pending && changed.length === 0 && (
          <span className={s.ok}>Saved.</span>
        )}
        {state?.ok === false && !pending && (
          <span className={s.err}>{state.error}</span>
        )}
      </form>
    </>
  );
}
