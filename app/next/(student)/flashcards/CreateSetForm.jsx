// "Create a new set" form on the flashcards landing page. Uses
// router.refresh() after success so the freshly-created set
// shows up in the list above without a full reload.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createFlashcardSet } from '@/lib/practice/flashcards-actions';
import s from './Flashcards.module.css';

export function CreateSetForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await createFlashcardSet({ name: trimmed });
      if (!res?.ok) {
        setError(res?.error ?? 'Could not create set');
        return;
      }
      setName('');
      router.refresh();
    });
  }

  return (
    <form className={s.createForm} onSubmit={handleSubmit}>
      <input
        type="text"
        className={s.createInput}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g., AP Lit terms"
        maxLength={80}
        disabled={pending}
      />
      <button
        type="submit"
        className={s.createSubmit}
        disabled={pending || !name.trim()}
      >
        {pending ? 'Creating…' : 'Create set'}
      </button>
      {error && <span className={s.createError}>{error}</span>}
    </form>
  );
}
