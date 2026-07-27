// Per-lesson editor client. Composes four surfaces:
//
//   1. Metadata form  — title / description / status / visibility /
//                       kind (+ foundation order).
//   2. Scope tags     — the lesson_topics rows: which section, skill,
//                       or question pattern this lesson teaches.
//   3. Lesson canvas   — the WYSIWYG block editor (CanvasEditor): a
//                       single vertical canvas with inline editing,
//                       drag-to-reorder, and between-block inserters.
//   4. Danger zone    — delete the whole lesson (typed confirm).
//
// All mutations go through Server Actions. The canvas keeps blocks in
// local state and posts the full list to saveLessonBlocks, which
// re-validates server-side before any DB write.

'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';
import { CanvasEditor } from './CanvasEditor';
import a from '../../../admin.module.css';
import f from '../../../forms.module.css';

export function EditorClient({ lesson, initialBlocks, topics, actions }) {
  return (
    <div style={S.col}>
      <MetadataSection lesson={lesson} action={actions.updateMetadata} />
      <ScopeTagsSection
        lessonId={lesson.id}
        topics={topics ?? []}
        addAction={actions.addTopic}
        removeAction={actions.removeTopic}
      />
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
  // Controlled so the foundation-order field appears/disappears with
  // the kind; the server clears foundation_sequence for standard.
  const [kind, setKind] = useState(lesson.kind ?? 'standard');

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

        <div className={f.grid}>
          <label className={f.label}>
            <span className={f.labelText}>Kind</span>
            <select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className={f.select}
            >
              <option value="standard">standard</option>
              <option value="foundation">foundation</option>
            </select>
          </label>
          {kind === 'foundation' && (
            <label className={f.label}>
              <span className={f.labelText}>Foundation order</span>
              <input
                type="number"
                name="foundation_sequence"
                min="1"
                step="1"
                defaultValue={lesson.foundation_sequence ?? ''}
                placeholder="1 = first before drilling"
                className={f.input}
              />
            </label>
          )}
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

// ─── Scope tags ──────────────────────────────────────────────────
//
// lesson_topics editor for the section/domain/skill grains. Pattern
// tags are shown (so the generate-flow stamp is visible) but authored
// through the pattern catalog tooling, not here. One select encodes
// the grain + value; hidden inputs decode it for the server action.

function topicLabel(topic) {
  if (topic.section) {
    return topic.section === 'math' ? 'Math section' : 'Reading & Writing section';
  }
  if (topic.pattern_id) {
    const name = topic.question_patterns?.name;
    return name ? `Pattern: ${name}` : `Pattern ${String(topic.pattern_id).slice(0, 8)}…`;
  }
  if (topic.skill_code) return `${topic.skill_code} · ${topic.domain_name}`;
  return topic.domain_name ?? 'Unknown tag';
}

function ScopeTagsSection({ lessonId, topics, addAction, removeAction }) {
  const [addState, addFormAction, addPending] = useActionState(addAction, null);
  const [removeState, removeFormAction, removePending] = useActionState(removeAction, null);
  const [choice, setChoice] = useState('');

  // choice encodes grain + value: "section:math" or "skill:<domain>|<code>".
  const [choiceKind, choiceRest] = choice ? choice.split(/:(.*)/s) : ['', ''];
  const [choiceDomain, choiceSkill] = choiceKind === 'skill' ? choiceRest.split('|') : ['', ''];

  return (
    <section className={a.section}>
      <h2 className={a.h2}>Scope tags</h2>
      <p className={f.muted} style={{ fontSize: 13, marginTop: -4 }}>
        What this lesson teaches: a skill tag counts the lesson toward that
        unit&rsquo;s coverage once published; a section tag marks a foundation
        that applies to the whole section.
      </p>

      <div style={S.tagRow}>
        {topics.length === 0 && (
          <span className={f.muted} style={{ fontSize: 13 }}>
            No tags yet — untagged lessons don&rsquo;t count toward unit coverage.
          </span>
        )}
        {topics.map((topic) => (
          <form key={topic.id} action={removeFormAction} style={S.tagChipForm}>
            <input type="hidden" name="lesson_id" value={lessonId} />
            <input type="hidden" name="topic_id" value={topic.id} />
            <span style={S.tagChip}>
              {topicLabel(topic)}
              <button
                type="submit"
                disabled={removePending}
                title="Remove tag"
                style={S.tagRemove}
              >
                ×
              </button>
            </span>
          </form>
        ))}
      </div>

      <form action={addFormAction} className={f.actions} style={{ alignItems: 'flex-end' }}>
        <input type="hidden" name="lesson_id" value={lessonId} />
        {choiceKind === 'section' && <input type="hidden" name="section" value={choiceRest} />}
        {choiceKind === 'skill' && (
          <>
            <input type="hidden" name="domain_name" value={choiceDomain} />
            <input type="hidden" name="skill_code" value={choiceSkill} />
          </>
        )}
        <label className={f.label} style={{ minWidth: 320 }}>
          <span className={f.labelText}>Add tag</span>
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className={f.select}
          >
            <option value="">Pick a section or skill…</option>
            <option value="section:math">Math section (foundation scope)</option>
            <option value="section:reading_writing">
              Reading &amp; Writing section (foundation scope)
            </option>
            {SAT_TAXONOMY.map((domain) => (
              <optgroup key={domain.code} label={domain.name}>
                {domain.skills.map((skill) => (
                  <option key={skill.code} value={`skill:${domain.name}|${skill.code}`}>
                    {skill.code} {skill.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary" disabled={addPending || !choice}>
          {addPending ? 'Adding…' : 'Add tag'}
        </Button>
        {addState?.ok === false && !addPending && (
          <span className={f.err}>{addState.error}</span>
        )}
        {removeState?.ok === false && !removePending && (
          <span className={f.err}>{removeState.error}</span>
        )}
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
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    margin: '10px 0 14px',
    minHeight: 28,
    alignItems: 'center',
  },
  tagChipForm: { display: 'inline-flex' },
  tagChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 6px 3px 10px',
    borderRadius: 'var(--radius-pill, 999px)',
    fontSize: 13,
    fontWeight: 600,
    background: 'var(--color-slate-100, #f1f5f9)',
    border: '1px solid var(--border, #e2e8f0)',
  },
  tagRemove: {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 15,
    lineHeight: 1,
    padding: '0 4px',
    color: 'var(--fg3, #6b7280)',
  },
};
