'use client';

import { useActionState, useEffect, useState } from 'react';
import { saveRoutingRules } from './actions';

const DEFAULTS = [
  { subject_code: 'RW', from_module_number: 1, metric: 'correct_count', operator: '>=', threshold: 15, to_route_code: 'hard' },
  { subject_code: 'RW', from_module_number: 1, metric: 'correct_count', operator: '<',  threshold: 15, to_route_code: 'easy' },
  { subject_code: 'MATH', from_module_number: 1, metric: 'correct_count', operator: '>=', threshold: 14, to_route_code: 'hard' },
  { subject_code: 'MATH', from_module_number: 1, metric: 'correct_count', operator: '<',  threshold: 14, to_route_code: 'easy' },
];

export function RoutingRulesSection({ tests, selectedTestId, rules: initialRules, modules }) {
  const [rules, setRules] = useState(initialRules);
  const [dirty, setDirty] = useState(false);
  const [state, formAction, pending] = useActionState(saveRoutingRules, null);

  // Reset local state when the server reloads with a new test or new rule data.
  useEffect(() => {
    setRules(initialRules);
    setDirty(false);
  }, [initialRules, selectedTestId]);

  const routeCodes = (subject) => [
    ...new Set(
      modules
        .filter((m) => m.subject_code.toUpperCase() === subject.toUpperCase() && m.module_number === 2)
        .map((m) => m.route_code)
        .filter(Boolean),
    ),
  ];

  function updateRule(idx, key, value) {
    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    setDirty(true);
  }
  function removeRule(idx) {
    setRules((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }
  function addRule() {
    setRules((prev) => [
      ...prev,
      { subject_code: 'RW', from_module_number: 1, metric: 'correct_count', operator: '>=', threshold: 15, to_route_code: '' },
    ]);
    setDirty(true);
  }
  function resetDefaults() {
    setRules(DEFAULTS.map((r) => ({ ...r })));
    setDirty(true);
  }

  return (
    <>
      <form method="GET" action="/admin/content" style={S.selectorRow}>
        <label style={S.field}>
          <span style={S.fieldLabel}>Practice test</span>
          <select name="routing_test" defaultValue={selectedTestId ?? ''} style={S.select}>
            <option value="">Select a test…</option>
            {tests.map((t) => (
              <option key={t.id} value={t.id}>{t.name ?? t.code}</option>
            ))}
          </select>
        </label>
        <button type="submit" style={S.btnSecondary}>Load</button>
      </form>

      {!selectedTestId && (
        <p style={S.hint}>Pick a test to view and edit its routing rules.</p>
      )}

      {selectedTestId && (
        <>
          {modules.length > 0 && (
            <div style={S.modulesSummary}>
              <span style={S.hint}>Modules:</span>
              {modules.map((m) => (
                <span key={m.id} style={S.pill}>
                  {m.subject_code} M{m.module_number}{m.route_code ? ` (${m.route_code})` : ''}
                </span>
              ))}
            </div>
          )}

          {rules.length === 0 && (
            <div style={S.infoCard}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#4b5563' }}>
                No routing rules configured for this test. The system uses default fallback:
                RW ≥ 15 correct → <code>hard</code>, MATH ≥ 14 correct → <code>hard</code>.
                Otherwise → <code>easy</code>.
              </p>
            </div>
          )}

          {rules.length > 0 && (
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Subject</th>
                    <th style={S.th}>Metric</th>
                    <th style={S.th}>Op</th>
                    <th style={S.th}>Threshold</th>
                    <th style={S.th}>Route to</th>
                    <th style={{ ...S.th, width: 50 }} />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r, i) => {
                    const codes = routeCodes(r.subject_code);
                    return (
                      <tr key={i}>
                        <td style={S.td}>
                          <select value={r.subject_code} onChange={(e) => updateRule(i, 'subject_code', e.target.value)} style={S.selectSmall}>
                            <option value="RW">RW</option>
                            <option value="MATH">MATH</option>
                          </select>
                        </td>
                        <td style={S.td}>
                          <select value={r.metric ?? 'correct_count'} onChange={(e) => updateRule(i, 'metric', e.target.value)} style={S.selectSmall}>
                            <option value="correct_count">correct_count</option>
                          </select>
                        </td>
                        <td style={S.td}>
                          <select value={r.operator} onChange={(e) => updateRule(i, 'operator', e.target.value)} style={S.selectSmall}>
                            <option value=">=">≥</option>
                            <option value=">">&gt;</option>
                            <option value="<=">≤</option>
                            <option value="<">&lt;</option>
                            <option value="==">==</option>
                          </select>
                        </td>
                        <td style={S.td}>
                          <input
                            type="number"
                            value={r.threshold}
                            onChange={(e) => updateRule(i, 'threshold', Number(e.target.value))}
                            style={S.numInput}
                          />
                        </td>
                        <td style={S.td}>
                          {codes.length > 0 ? (
                            <select value={r.to_route_code ?? ''} onChange={(e) => updateRule(i, 'to_route_code', e.target.value)} style={S.selectSmall}>
                              <option value="">—</option>
                              {codes.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={r.to_route_code ?? ''}
                              onChange={(e) => updateRule(i, 'to_route_code', e.target.value)}
                              placeholder="route code"
                              style={S.textInput}
                            />
                          )}
                        </td>
                        <td style={S.td}>
                          <button type="button" onClick={() => removeRule(i)} style={S.rmBtn} title="Remove">×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <form action={formAction} style={S.saveRow}>
            <input type="hidden" name="practice_test_id" value={selectedTestId} />
            <input type="hidden" name="rules_json" value={JSON.stringify(rules)} />
            <button type="button" onClick={addRule} style={S.btnSecondary}>+ Add rule</button>
            <button type="button" onClick={resetDefaults} style={S.btnSecondary}>Reset to defaults</button>
            <button type="submit" disabled={pending || !dirty} style={S.btnPrimary}>
              {pending ? 'Saving…' : 'Save rules'}
            </button>
            {dirty && <span style={S.hint}>unsaved changes</span>}
            {state?.ok && !pending && !dirty && <span style={S.ok}>Saved {state.data.count} rules.</span>}
            {state?.ok === false && !pending && <span style={S.err}>{state.error}</span>}
          </form>
        </>
      )}
    </>
  );
}

const S = {
  selectorRow: { display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  fieldLabel: { fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.025em' },
  select: { padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem', background: 'white', minWidth: 260 },
  selectSmall: { padding: '0.3rem 0.45rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.8rem', background: 'white' },
  numInput: { padding: '0.3rem 0.45rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.8rem', width: 70 },
  textInput: { padding: '0.3rem 0.45rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.8rem', width: 100 },
  hint: { fontSize: '0.8rem', color: '#6b7280' },
  modulesSummary: { display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center', marginBottom: '0.75rem' },
  pill: { padding: '0.15rem 0.55rem', background: '#eff6ff', color: '#1d4ed8', borderRadius: 999, fontSize: '0.75rem', fontWeight: 500 },
  infoCard: { padding: '0.75rem 1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, marginBottom: '1rem' },
  tableWrap: { overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: '0.75rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th: { textAlign: 'left', padding: '0.4rem 0.7rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '0.7rem', textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.025em' },
  td: { padding: '0.35rem 0.7rem', borderBottom: '1px solid #f3f4f6' },
  saveRow: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' },
  btnPrimary: { padding: '0.45rem 0.9rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  btnSecondary: { padding: '0.45rem 0.9rem', background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' },
  rmBtn: { background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700, padding: '0 0.4rem' },
  ok: { color: '#166534', fontSize: '0.85rem' },
  err: { color: '#991b1b', fontSize: '0.85rem' },
};
