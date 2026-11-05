'use client';

// Saved question recipes (§4.3), shown inside step 1. Applying one
// navigates with ?template= so the recipe resolves server-side, the
// same path as a shared deep link. Delete builds its own FormData
// (a nested <form> inside the assignment form isn't allowed).

import { useState } from 'react';
import type { ActionResult } from '@/lib/types';
import styles from './NewAssignmentInteractive.module.css';

export type TemplateOption = { id: string; name: string; testType?: 'sat' | 'act' };
export type TemplateDeleteAction = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

export function TemplateShelf({ templates, onApply, deleteAction }: {
  templates: TemplateOption[];
  onApply: (id: string) => void;
  deleteAction?: TemplateDeleteAction;
}) {
  return (
    <div className={styles.templateShelf}>
      <span className={styles.controlLabel}>Start from a template</span>
      <ul className={styles.templateList}>
        {templates.map((t) => <TemplateChip key={t.id} template={t} onApply={onApply} deleteAction={deleteAction} />)}
      </ul>
    </div>
  );
}

function TemplateChip({ template, onApply, deleteAction }: {
  template: TemplateOption;
  onApply: (id: string) => void;
  deleteAction?: TemplateDeleteAction;
}) {
  const [state, setState] = useState<ActionResult | null>(null);
  const [deleting, setDeleting] = useState(false);
  if (state?.ok) return null;

  async function onDelete() {
    if (!deleteAction || deleting) return;
    setDeleting(true);
    const fd = new FormData();
    fd.set('template_id', template.id);
    setState(await deleteAction(null, fd));
    setDeleting(false);
  }

  return (
    <li className={styles.templateChip}>
      <button type="button" className={styles.templateApplyBtn} onClick={() => onApply(template.id)}>
        {template.name}
        {template.testType === 'act' && <span className={styles.templateTag}>ACT</span>}
      </button>
      <button
        type="button"
        className={styles.templateDeleteBtn}
        onClick={onDelete}
        disabled={deleting || !deleteAction}
        aria-label={`Delete template ${template.name}`}
        title={state && !state.ok ? state.error : 'Delete template'}
      >
        {deleting ? '…' : '✕'}
      </button>
    </li>
  );
}
