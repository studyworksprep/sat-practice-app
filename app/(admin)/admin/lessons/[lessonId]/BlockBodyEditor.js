// Per-block-type form editor dispatcher.
//
// Given a block and an onChange(nextContent) callback, renders a
// friendly form for that block_type:
//   text          → body HTML
//   video         → url + caption
//   check         → prompt, choices (+ correct answer), explanation
//   question_link → question_id
//   desmos_interactive → the rich DesmosBlockEditor
//
// The content shapes mirror what lib/ui/LessonSlideshow.jsx reads at
// runtime and what lib/lesson/lesson-validation.mjs checks. Branching
// and workflow metadata that isn't surfaced here (e.g. on a check
// block) remains editable via the JSON toggle in EditorClient.

'use client';

import { Button } from '@/lib/ui/Button';
import { cleanupDesmosContent } from '@/lib/lesson/desmos-form-utils.mjs';
import { DesmosBlockEditor } from './DesmosBlockEditor';
import {
  Section,
  TextField,
  TextAreaField,
} from './editor-fields';
import f from '../../../forms.module.css';

export function BlockBodyEditor({ block, onChange }) {
  const type = block?.block_type;
  const content = block?.content || {};

  // Shallow field setter for the simple block types.
  const set = (key, value) => onChange({ ...content, [key]: value });

  if (type === 'text') {
    return (
      <Section title="Text" hint="HTML is rendered as-is in the lesson. Use simple tags like <p>, <strong>, <ul>.">
        <TextField label="Block id" value={content.id} onChange={(v) => set('id', v)} />
        <TextAreaField label="Body (HTML)" value={content.html} onChange={(v) => set('html', v)} rows={8} mono />
      </Section>
    );
  }

  if (type === 'video') {
    return (
      <Section title="Video" hint="YouTube and Vimeo URLs are embedded automatically; other URLs render as a link.">
        <TextField label="Block id" value={content.id} onChange={(v) => set('id', v)} />
        <TextField label="Video URL" value={content.url} onChange={(v) => set('url', v)} placeholder="https://www.youtube.com/watch?v=…" />
        <TextField label="Caption" value={content.caption} onChange={(v) => set('caption', v)} />
      </Section>
    );
  }

  if (type === 'question_link') {
    return (
      <Section title="Question link" hint="Links a practice question into the lesson by its id.">
        <TextField label="Block id" value={content.id} onChange={(v) => set('id', v)} />
        <TextField label="Question id" value={content.question_id} onChange={(v) => set('question_id', v)} required />
        {!content.question_id && <span className={f.err}>A question id is required for this block to render.</span>}
      </Section>
    );
  }

  if (type === 'check') {
    return <CheckEditor content={content} onChange={onChange} />;
  }

  if (type === 'desmos_interactive') {
    return (
      <DesmosBlockEditor
        content={content}
        onChange={(next) => onChange(cleanupDesmosContent(next))}
      />
    );
  }

  return <p className={f.muted}>No form editor for block type “{type}”. Use the JSON tab.</p>;
}

function CheckEditor({ content, onChange }) {
  const choices = Array.isArray(content.choices) ? content.choices : [];
  const correctIndex = content.correct_index ?? 0;
  const set = (key, value) => onChange({ ...content, [key]: value });

  function setChoice(i, value) {
    const next = [...choices];
    next[i] = value;
    set('choices', next);
  }

  function addChoice() {
    set('choices', [...choices, `Choice ${String.fromCharCode(65 + choices.length)}`]);
  }

  function deleteChoice(i) {
    const next = choices.filter((_, idx) => idx !== i);
    // Keep correct_index pointing at the same choice where possible.
    let nextCorrect = correctIndex;
    if (i === correctIndex) nextCorrect = 0;
    else if (i < correctIndex) nextCorrect = correctIndex - 1;
    onChange({ ...content, choices: next, correct_index: Math.max(0, Math.min(nextCorrect, next.length - 1)) });
  }

  return (
    <Section title="Knowledge check" hint="Select the radio next to the correct answer.">
      <TextField label="Block id" value={content.id} onChange={(v) => set('id', v)} />
      <TextAreaField label="Prompt" value={content.prompt} onChange={(v) => set('prompt', v)} rows={2} />

      <div className={f.label}>
        <span className={f.labelText}>Choices</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {choices.map((choice, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name="correct_choice"
                checked={i === correctIndex}
                onChange={() => set('correct_index', i)}
                title="Mark as correct answer"
              />
              <input
                type="text"
                className={f.input}
                value={choice ?? ''}
                onChange={(e) => setChoice(i, e.target.value)}
                style={{ flex: 1 }}
              />
              <Button variant="remove" size="sm" disabled={choices.length <= 1} onClick={() => deleteChoice(i)}>
                Delete
              </Button>
            </div>
          ))}
        </div>
        {choices.length === 0 && <span className={f.err}>Add at least one choice.</span>}
      </div>
      <div>
        <Button variant="secondary" size="sm" onClick={addChoice}>+ Add choice</Button>
      </div>

      <TextAreaField label="Explanation (shown after answering)" value={content.explanation} onChange={(v) => set('explanation', v)} rows={2} />
    </Section>
  );
}
