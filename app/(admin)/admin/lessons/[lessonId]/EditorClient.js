// Per-lesson editor client. Composes four surfaces:
//
//   1. Metadata form  — title / description / status / visibility /
//                       kind (+ foundation order).
//   2. Scope tags     — the lesson_topics rows: which section or skill
//                       this lesson teaches.
//   2b. Techniques    — the lesson_techniques rows: what the lesson
//                       teaches the student to DO (graphing, regression,
//                       Good Cop Bad Cop…); the practice set after it
//                       in a unit's syllabus narrows to these.
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
import { describeLessonTopicRows, untaggedLessonTagOptions } from '@/lib/lesson/catalog';
import { CanvasEditor } from './CanvasEditor';
import a from '../../../admin.module.css';
import f from '../../../forms.module.css';

/**
 * @param {object} props
 * @param {any} props.lesson
 * @param {any[]} props.initialBlocks
 * @param {any[]} [props.topics]
 * @param {Array<{ technique_id: string, name: string }>} [props.techniques]
 *   - lesson_techniques rows (or the revision's copy) with names
 * @param {Array<{ id: string, name: string, description: string, section: string | null }>} [props.techniqueCatalog]
 *   - the whole catalog, for the add select
 * @param {any} props.actions
 * @param {boolean} [props.revisionMode]
 */
export function EditorClient({
  lesson,
  initialBlocks,
  topics,
  techniques = [],
  techniqueCatalog = [],
  actions,
  revisionMode = false,
}) {
  return (
    <div style={S.col}>
      <MetadataSection
        lesson={lesson}
        action={actions.updateMetadata}
        revisionMode={revisionMode}
      />
      <ScopeTagsSection
        lessonId={lesson.id}
        topics={topics ?? []}
        addAction={actions.addTopic}
        removeAction={actions.removeTopic}
      />
      {actions.addTechnique && actions.removeTechnique && (
        <TechniquesSection
          lessonId={lesson.id}
          techniques={techniques ?? []}
          catalog={techniqueCatalog ?? []}
          addAction={actions.addTechnique}
          removeAction={actions.removeTechnique}
        />
      )}
      <CanvasEditor
        lessonId={lesson.id}
        initialBlocks={initialBlocks}
        action={actions.saveBlocks}
        saveLabel={revisionMode ? 'Save draft' : 'Save lesson'}
      />
      <DangerZone
        lessonId={lesson.id}
        action={actions.deleteLesson}
        revisionMode={revisionMode}
      />
    </div>
  );
}

// ─── Metadata ────────────────────────────────────────────────────

function MetadataSection({ lesson, action, revisionMode }) {
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

        {revisionMode ? (
          <div style={S.draftNotice}>
            Private draft · Only you and admins can see this work. Publication
            is controlled by the admin review workflow.
          </div>
        ) : (
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
        )}

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
// lesson_topics editor for the section/domain/skill grains. One select
// encodes the grain + value; hidden inputs decode it for the server
// action. The techniques a lesson teaches are a separate link table
// (lesson_techniques), not a scope grain.
//
// Chips name the skill (its code is the secondary text), in the same
// words the Add tag menu uses, and the menu leaves out what the lesson
// already has: the database allows each tag once, and a chip that read
// "H.A. · Algebra" next to a menu entry "Linear equations in one
// variable" made a stored tag look missing (lib/lesson/catalog.ts).

function ScopeTagsSection({ lessonId, topics, addAction, removeAction }) {
  const [addState, addFormAction, addPending] = useActionState(addAction, null);
  const [removeState, removeFormAction, removePending] = useActionState(removeAction, null);
  const [choice, setChoice] = useState('');

  const chips = describeLessonTopicRows(topics);
  const menu = untaggedLessonTagOptions(topics);
  // A pick the lesson now has (just added, or added in another tab) is
  // no longer offered; fall back to the placeholder rather than post it.
  const offered = new Set([
    ...menu.sections.map((sec) => `section:${sec.value}`),
    ...menu.domains.flatMap((domain) => domain.skills.map((skill) => `skill:${domain.name}|${skill.code}`)),
  ]);
  const current = offered.has(choice) ? choice : '';

  // current encodes grain + value: "section:math" or "skill:<domain>|<code>".
  const [choiceKind, choiceRest] = current ? current.split(/:(.*)/s) : ['', ''];
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
        {chips.length === 0 && (
          <span className={f.muted} style={{ fontSize: 13 }}>
            No tags yet — untagged lessons don&rsquo;t count toward unit coverage.
          </span>
        )}
        {chips.map((chip) => (
          <form key={chip.id} action={removeFormAction} style={S.tagChipForm}>
            <input type="hidden" name="lesson_id" value={lessonId} />
            <input type="hidden" name="topic_id" value={chip.id} />
            <span style={S.tagChip} title={chip.title}>
              {chip.label}
              {chip.detail && <span style={S.tagDetail}>{chip.detail}</span>}
              <button
                type="submit"
                disabled={removePending}
                title={`Remove ${chip.label}`}
                aria-label={`Remove ${chip.label}`}
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
            value={current}
            onChange={(e) => setChoice(e.target.value)}
            className={f.select}
          >
            <option value="">
              {offered.size === 0 ? 'Every section and skill is already tagged' : 'Pick a section or skill…'}
            </option>
            {menu.sections.map((sec) => (
              <option key={sec.value} value={`section:${sec.value}`}>
                {sec.label} section (foundation scope)
              </option>
            ))}
            {menu.domains.map((domain) => (
              <optgroup key={domain.code} label={domain.name}>
                {domain.skills.map((skill) => (
                  <option key={skill.code} value={`skill:${domain.name}|${skill.code}`}>
                    {skill.name} · {skill.code}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary" disabled={addPending || !current}>
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

// ─── Techniques ──────────────────────────────────────────────────
//
// lesson_techniques editor: chips for the techniques this lesson
// teaches, plus a select to add one from the catalog (grouped by
// section). Same form-per-chip shape as the scope tags so the two
// sections behave alike; the actions differ per host (admin lesson vs
// tutor draft revision).

const SECTION_GROUPS = [
  ['math', 'Math'],
  ['reading_writing', 'Reading & Writing'],
  [null, 'Both sections'],
];

function TechniquesSection({ lessonId, techniques, catalog, addAction, removeAction }) {
  const [addState, addFormAction, addPending] = useActionState(addAction, null);
  const [removeState, removeFormAction, removePending] = useActionState(removeAction, null);
  const [choice, setChoice] = useState('');

  const linked = new Set(techniques.map((t) => t.technique_id));
  const addable = catalog.filter((t) => !linked.has(t.id));

  return (
    <section className={a.section}>
      <h2 className={a.h2}>Techniques</h2>
      <p className={f.muted} style={{ fontSize: 13, marginTop: -4 }}>
        What this lesson teaches the student to <em>do</em>. In a unit&rsquo;s syllabus, the
        practice set after this lesson draws questions solved with these techniques first.
      </p>

      <div style={S.tagRow}>
        {techniques.length === 0 && (
          <span className={f.muted} style={{ fontSize: 13 }}>
            No techniques yet &mdash; the practice set after this lesson uses the whole skill.
          </span>
        )}
        {techniques.map((t) => (
          <form key={t.technique_id} action={removeFormAction} style={S.tagChipForm}>
            <input type="hidden" name="lesson_id" value={lessonId} />
            <input type="hidden" name="technique_id" value={t.technique_id} />
            <span style={S.tagChip}>
              {t.name}
              <button
                type="submit"
                disabled={removePending}
                title="Remove technique"
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
        <input type="hidden" name="technique_id" value={choice} />
        <label className={f.label} style={{ minWidth: 320 }}>
          <span className={f.labelText}>Add technique</span>
          <select value={choice} onChange={(e) => setChoice(e.target.value)} className={f.select}>
            <option value="">{catalog.length === 0 ? 'No techniques in the catalog yet' : 'Pick a technique…'}</option>
            {SECTION_GROUPS.map(([section, label]) => {
              const items = addable.filter((t) => (t.section ?? null) === section);
              if (items.length === 0) return null;
              return (
                <optgroup key={label} label={label}>
                  {items.map((t) => (
                    <option key={t.id} value={t.id} title={t.description}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>
        <Button type="submit" variant="secondary" disabled={addPending || !choice}>
          {addPending ? 'Adding…' : 'Add technique'}
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

function DangerZone({ lessonId, action, revisionMode }) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <section className={a.section} style={S.danger}>
      <h2 className={a.h2}>Danger zone</h2>
      <p className={f.formHint}>
        {revisionMode
          ? 'Delete this private draft and its working blocks. The published lesson is never affected.'
          : 'Deleting a lesson cascades to its blocks, assignments, and student progress.'}{' '}
        Type <code>DELETE</code> to confirm.
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
          {pending ? 'Deleting…' : revisionMode ? 'Delete draft' : 'Delete lesson'}
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
  draftNotice: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-app-accent)',
    background: 'var(--color-app-accent-bg, #eef2ff)',
    color: 'var(--fg2)',
    fontSize: 13,
  },
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
  tagDetail: {
    color: 'var(--fg3, #6b7280)',
    fontSize: 12,
    fontWeight: 500,
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
