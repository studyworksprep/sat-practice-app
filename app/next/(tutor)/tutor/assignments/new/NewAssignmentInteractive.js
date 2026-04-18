// Teacher assignment-creation form. One form, three type-specific
// payload groups toggled by the selected assignment_type.
//
// Client state is intentionally thin — the form fields themselves
// carry the submission data; local state is only used for:
//   - which type is active (drives which fieldset is visible)
//   - which domain is selected (drives which skills list to show)
//   - the working student-selection set (checkbox UX)
//
// On submit, React 19's useActionState handles pending/error state
// and the Server Action redirects on success.

'use client';

import { useActionState, useMemo, useState } from 'react';

export function NewAssignmentInteractive({
  students,
  domains,
  difficulties,
  scoreBands,
  practiceTests,
  lessons,
  createAction,
}) {
  const [state, submitAction, isPending] = useActionState(createAction, null);

  const [assignmentType, setAssignmentType] = useState('questions');
  const [selectedDomains, setSelectedDomains] = useState(new Set());
  const [selectedStudents, setSelectedStudents] = useState(new Set());

  // Skills list is the union of skills across the selected domains.
  const availableSkills = useMemo(() => {
    const set = new Set();
    for (const d of domains) {
      if (selectedDomains.size === 0 || selectedDomains.has(d.name)) {
        d.skills.forEach((s) => set.add(s));
      }
    }
    return Array.from(set).sort();
  }, [domains, selectedDomains]);

  const toggle = (set, setter, value) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  return (
    <form action={submitAction} style={S.form}>
      {/* Type selector */}
      <fieldset style={S.fieldset}>
        <legend style={S.legend}>Type</legend>
        <div style={S.typeRow}>
          {[
            { value: 'questions', label: 'Questions' },
            { value: 'practice_test', label: 'Practice Test' },
            { value: 'lesson', label: 'Lesson' },
          ].map((t) => (
            <label key={t.value} style={S.typeOption}>
              <input
                type="radio"
                name="assignment_type"
                value={t.value}
                checked={assignmentType === t.value}
                onChange={() => setAssignmentType(t.value)}
              />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Common fields */}
      <fieldset style={S.fieldset}>
        <legend style={S.legend}>Details</legend>
        <label style={S.fieldLabel}>
          Title
          <input name="title" type="text" maxLength={200} style={S.input} />
        </label>
        <label style={S.fieldLabel}>
          Description
          <textarea name="description" rows={2} style={S.textarea} />
        </label>
        <label style={S.fieldLabel}>
          Due date
          <input name="due_date" type="date" style={S.input} />
        </label>
      </fieldset>

      {/* Students */}
      <fieldset style={S.fieldset}>
        <legend style={S.legend}>
          Students <span style={S.legendCount}>({selectedStudents.size} selected)</span>
        </legend>
        {students.length === 0 ? (
          <p style={S.empty}>You have no students yet.</p>
        ) : (
          <div style={S.studentGrid}>
            {students.map((s) => (
              <label key={s.id} style={S.studentItem}>
                <input
                  type="checkbox"
                  name="student_id"
                  value={s.id}
                  checked={selectedStudents.has(s.id)}
                  onChange={() => toggle(selectedStudents, setSelectedStudents, s.id)}
                />
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: 500 }}>{s.name}</span>
                  {s.email && <span style={{ color: '#6b7280', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{s.email}</span>}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {/* Type-specific groups */}
      {assignmentType === 'questions' && (
        <fieldset style={S.fieldset}>
          <legend style={S.legend}>Question pool</legend>
          <p style={S.helpText}>
            The system picks a random set of matching questions when you create the assignment.
          </p>

          <div style={S.fieldLabel}>Domains</div>
          <div style={S.checkList}>
            {domains.map((d) => (
              <label key={d.name} style={S.checkItem}>
                <input
                  type="checkbox"
                  name="domain"
                  value={d.name}
                  checked={selectedDomains.has(d.name)}
                  onChange={() => toggle(selectedDomains, setSelectedDomains, d.name)}
                />
                <span>{d.name}</span>
              </label>
            ))}
          </div>

          {availableSkills.length > 0 && (
            <>
              <div style={{ ...S.fieldLabel, marginTop: '0.75rem' }}>Skills (optional)</div>
              <div style={S.checkList}>
                {availableSkills.map((s) => (
                  <label key={s} style={S.checkItem}>
                    <input type="checkbox" name="skill" value={s} />
                    <span>{s}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {difficulties.length > 0 && (
            <>
              <div style={{ ...S.fieldLabel, marginTop: '0.75rem' }}>Difficulty</div>
              <div style={S.checkList}>
                {difficulties.map((d) => (
                  <label key={d} style={S.checkItem}>
                    <input type="checkbox" name="difficulty" value={d} />
                    <span>{difficultyLabel(d)}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {scoreBands.length > 0 && (
            <>
              <div style={{ ...S.fieldLabel, marginTop: '0.75rem' }}>Score bands</div>
              <div style={S.checkList}>
                {scoreBands.map((b) => (
                  <label key={b} style={S.checkItem}>
                    <input type="checkbox" name="score_band" value={b} />
                    <span>{b}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          <label style={{ ...S.fieldLabel, marginTop: '0.75rem' }}>
            Size (1–50)
            <input name="size" type="number" min="1" max="50" defaultValue="10" style={{ ...S.input, width: 100 }} />
          </label>
        </fieldset>
      )}

      {assignmentType === 'practice_test' && (
        <fieldset style={S.fieldset}>
          <legend style={S.legend}>Practice test</legend>
          <label style={S.fieldLabel}>
            Test
            <select name="practice_test_id" style={S.input} defaultValue="">
              <option value="" disabled>Select a practice test…</option>
              {practiceTests.map((pt) => (
                <option key={pt.id} value={pt.id}>{pt.label}</option>
              ))}
            </select>
          </label>
          <label style={S.fieldLabel}>
            Sections
            <select name="sections" style={S.input} defaultValue="both">
              <option value="both">Both</option>
              <option value="rw">Reading &amp; Writing only</option>
              <option value="math">Math only</option>
            </select>
          </label>
        </fieldset>
      )}

      {assignmentType === 'lesson' && (
        <fieldset style={S.fieldset}>
          <legend style={S.legend}>Lesson</legend>
          {lessons.length === 0 ? (
            <p style={S.empty}>No published lessons yet.</p>
          ) : (
            <label style={S.fieldLabel}>
              Lesson
              <select name="lesson_id" style={S.input} defaultValue="">
                <option value="" disabled>Select a lesson…</option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
      )}

      {/* Submit */}
      <div style={S.submitRow}>
        <button
          type="submit"
          disabled={isPending}
          style={{ ...S.submit, opacity: isPending ? 0.6 : 1 }}
        >
          {isPending ? 'Creating…' : 'Create assignment'}
        </button>
        {state && !state.ok && (
          <span role="alert" style={S.error}>{state.error}</span>
        )}
      </div>
    </form>
  );
}

function difficultyLabel(d) {
  return { 1: 'Easy', 2: 'Medium', 3: 'Hard' }[d] ?? String(d);
}

const S = {
  form: { display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' },
  fieldset: { border: '1px solid #e5e7eb', borderRadius: 8, padding: '1rem', margin: 0 },
  legend: { padding: '0 0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#374151' },
  legendCount: { fontWeight: 400, color: '#6b7280', marginLeft: '0.5rem' },
  typeRow: { display: 'flex', gap: '1.5rem', flexWrap: 'wrap' },
  typeOption: { display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' },
  fieldLabel: { display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem', color: '#374151', marginBottom: '0.75rem' },
  input: { padding: '0.5rem 0.625rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.95rem', fontFamily: 'inherit' },
  textarea: { padding: '0.5rem 0.625rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.95rem', fontFamily: 'inherit', resize: 'vertical' },
  checkList: { display: 'flex', flexWrap: 'wrap', gap: '0.75rem' },
  checkItem: { display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem' },
  studentGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.25rem' },
  studentItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 0.5rem', fontSize: '0.875rem' },
  helpText: { color: '#6b7280', fontSize: '0.85rem', margin: '0 0 0.75rem 0' },
  empty: { color: '#9ca3af', fontStyle: 'italic', margin: 0 },
  submitRow: { display: 'flex', alignItems: 'center', gap: '1rem' },
  submit: {
    padding: '0.625rem 1.25rem',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: { color: '#b91c1c', fontSize: '0.875rem' },
};
