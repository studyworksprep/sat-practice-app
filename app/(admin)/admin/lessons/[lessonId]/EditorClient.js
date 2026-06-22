// Per-lesson editor client. Composes three surfaces:
//
//   1. Metadata form  — title / description / status / visibility.
//   2. Lesson canvas   — the WYSIWYG block editor (CanvasEditor): a
//                       single vertical canvas with inline editing,
//                       drag-to-reorder, and between-block inserters.
//   3. Danger zone    — delete the whole lesson (typed confirm).
//
// All mutations go through Server Actions. The canvas keeps blocks in
// local state and posts the full list to saveLessonBlocks, which
// re-validates server-side before any DB write.

'use client';

import { useActionState } from 'react';
import { Button } from '@/lib/ui/Button';
import { CanvasEditor } from './CanvasEditor';
import a from '../../../admin.module.css';
import f from '../../../forms.module.css';

export function EditorClient({ lesson, initialBlocks, actions }) {
  return (
    <div style={S.col}>
      <MetadataSection lesson={lesson} action={actions.updateMetadata} />
      <CanvasEditor
        lessonId={lesson.id}
        initialBlocks={initialBlocks}
        action={actions.saveBlocks}
      />
      <DangerZone lessonId={lesson.id} action={actions.deleteLesson} />
    </div>
  );
}

// ─── Metadata ────────────────────────────────────────────────────

function MetadataSection({ lesson, action }) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <section className={a.section}>
      <h2 className={a.h2}>Metadata</h2>
      <form action={formAction} className={f.form}>
        <input type="hidden" name="lesson_id" value={lesson.id} />

        <label className={f.label}>
          <span className={f.labelText}>Title</span>
          <input
            type="text"
            name="title"
            defaultValue={lesson.title ?? ''}
            className={f.input}
            required
          />
        </label>

        <label className={f.label}>
          <span className={f.labelText}>Description</span>
          <input
            type="text"
            name="description"
            defaultValue={lesson.description ?? ''}
            className={f.input}
          />
        </label>

        <div className={f.grid}>
          <label className={f.label}>
            <span className={f.labelText}>Status</span>
            <select
              name="status"
              defaultValue={lesson.status ?? 'draft'}
              className={f.select}
            >
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <label className={f.label}>
            <span className={f.labelText}>Visibility</span>
            <select
              name="visibility"
              defaultValue={lesson.visibility ?? 'shared'}
              className={f.select}
            >
              <option value="shared">shared</option>
              <option value="private">private</option>
            </select>
          </label>
        </div>

        <div className={f.actions}>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Saving…' : 'Save metadata'}
          </Button>
          {state?.ok && !pending && <span className={f.ok}>Saved.</span>}
          {state?.ok === false && !pending && (
            <span className={f.err}>{state.error}</span>
          )}
        </div>
      </form>
    </section>
  );
}

// ─── Danger zone ─────────────────────────────────────────────────

function DangerZone({ lessonId, action }) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <section className={a.section} style={S.danger}>
      <h2 className={a.h2}>Danger zone</h2>
      <p className={f.formHint}>
        Deleting a lesson cascades to its blocks, assignments, and student
        progress. Type <code>DELETE</code> to confirm.
      </p>
      <form action={formAction} className={f.row}>
        <input type="hidden" name="lesson_id" value={lessonId} />
        <input
          type="text"
          name="confirm"
          placeholder="DELETE"
          className={f.input}
          style={{ maxWidth: 160 }}
        />
        <Button type="submit" variant="remove" disabled={pending}>
          {pending ? 'Deleting…' : 'Delete lesson'}
        </Button>
        {state?.ok === false && !pending && (
          <span className={f.err}>{state.error}</span>
        )}
      </form>
    </section>
  );
}

const S = {
  col: { display: 'flex', flexDirection: 'column', gap: 16 },
  danger: { borderColor: 'var(--color-danger)' },
};
