// Client island for the review page. Renders the three "Start
// review session" buttons (wrong / marked / both) and uses
// useActionState to manage the createReviewSession action.

'use client';

import { useActionState } from 'react';

export function ReviewLauncher({ counts, createReviewSessionAction }) {
  const [state, submitAction, isPending] = useActionState(createReviewSessionAction, null);

  return (
    <section>
      <h2 style={S.h2}>Start a review session</h2>
      <p style={S.help}>
        Each session pulls up to 25 questions from the selected pool, in
        random order, with the correct answer and rationale revealed
        immediately on every question.
      </p>
      <form action={submitAction} style={S.form}>
        <Button name="filter" value="wrong" disabled={counts.wrong === 0 || isPending}>
          Review {counts.wrong} wrong answer{counts.wrong === 1 ? '' : 's'}
        </Button>
        <Button name="filter" value="marked" disabled={counts.marked === 0 || isPending}>
          Review {counts.marked} marked item{counts.marked === 1 ? '' : 's'}
        </Button>
        <Button name="filter" value="both" disabled={counts.total === 0 || isPending}>
          Review all {counts.total}
        </Button>
      </form>
      {state && !state.ok && (
        <p role="alert" style={S.error}>
          {state.error}
        </p>
      )}
    </section>
  );
}

function Button({ children, ...rest }) {
  return (
    <button
      type="submit"
      style={{
        ...S.btn,
        ...(rest.disabled ? S.btnDisabled : null),
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

const S = {
  h2: { fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' },
  help: { color: '#4b5563', fontSize: '0.95rem', marginTop: 0, marginBottom: '1rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: 420 },
  btn: {
    textAlign: 'left',
    padding: '0.75rem 1rem',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnDisabled: { background: '#9ca3af', cursor: 'not-allowed' },
  error: { color: '#b91c1c', marginTop: '0.75rem', fontSize: '0.9rem' },
};
