// Per-block-type form editor dispatcher.
//
// Given a block and an onChange(nextContent) callback, renders a
// friendly form for that block_type:
//   text          → body HTML
//   video         → url + caption
//   check         → prompt, then either choices (+ correct answer) or a
//                   typed numeric answer (plan 1.6), explanation,
//                   optional retry-until-correct mode with a hint
//   question_link → question_id
//   desmos_interactive → the rich DesmosBlockEditor
//
// The content shapes mirror what lib/ui/LessonSlideshow.jsx reads at
// runtime and what lib/lesson/lesson-validation.mjs checks. Branching
// and workflow metadata that isn't surfaced here (e.g. on a check
// block) remains editable via the JSON toggle in EditorClient.

'use client';

import { Button } from '@/lib/ui/Button';
import { cleanupDesmosContent, parseCommaSeparatedList } from '@/lib/lesson/desmos-form-utils.mjs';
import { isNumericCheck, validateNumericCheckContent } from '@/lib/lesson/numeric-check.mjs';
import { DesmosBlockEditor } from './DesmosBlockEditor';
import {
  NumberField,
  Section,
  SelectField,
  TextField,
  TextAreaField,
} from './editor-fields';
import { MathTextArea, MathTextField } from './math-fields';
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
  const numeric = isNumericCheck(content);
  const set = (key, value) => onChange({ ...content, [key]: value });

  // Switching answer format swaps the shape wholesale — a check is one
  // or the other, and the validator rejects a block carrying both.
  function setFormat(format) {
    const next = { ...content };
    if (format === 'numeric') {
      delete next.choices;
      delete next.correct_index;
      onChange({ ...next, input: 'numeric', answer: content.answer ?? '' });
    } else {
      delete next.input;
      delete next.answer;
      delete next.accept;
      delete next.tolerance;
      onChange({
        ...next,
        choices: choices.length >= 2 ? choices : ['Choice A', 'Choice B'],
        correct_index: 0,
      });
    }
  }
  const numericProblems = numeric ? validateNumericCheckContent(content) : [];

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
    <Section title="Knowledge check" hint={numeric
      ? 'The learner types a number. Give the keyed answer the way a student would type it; list equivalent forms under Also accept.'
      : 'Select the radio next to the correct answer. Use √x to add math to the prompt, choices, or explanation.'}
    >
      <TextField label="Block id" value={content.id} onChange={(v) => set('id', v)} />
      <MathTextArea label="Prompt" value={content.prompt} onChange={(v) => set('prompt', v)} rows={2} />

      <SelectField
        label="Answer format"
        value={numeric ? 'numeric' : 'choice'}
        onChange={setFormat}
        options={[
          { value: 'choice', label: 'Multiple choice' },
          { value: 'numeric', label: 'Numeric entry (typed answer)' },
        ]}
      />

      {numeric ? (
        <>
          <TextField
            label="Correct answer"
            value={content.answer ?? ''}
            onChange={(v) => set('answer', v)}
            placeholder="e.g. 12.5 or 25/2"
            hint="A whole number, decimal, or a/b fraction — no units, no LaTeX. Fractions and decimals grade as equivalent automatically."
          />
          <TextField
            label="Also accept (comma-separated)"
            value={Array.isArray(content.accept) ? content.accept.join(', ') : ''}
            onChange={(v) => {
              const list = parseCommaSeparatedList(v);
              set('accept', list.length > 0 ? list : undefined);
            }}
            placeholder="e.g. 3/5, .6"
            hint="Optional. Other typeable forms that should count, such as a reduced fraction."
          />
          <NumberField
            label="Tolerance"
            value={content.tolerance ?? ''}
            onChange={(v) => set('tolerance', v === '' ? undefined : Number(v))}
            step="0.001"
            min={0}
          />
          {numericProblems.length > 0 && (
            <div className={f.err}>
              {numericProblems.map((m) => <div key={m}>{m}</div>)}
            </div>
          )}
        </>
      ) : (
      <div className={f.label}>
        <span className={f.labelText}>Choices</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {choices.map((choice, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <input
                type="radio"
                name="correct_choice"
                checked={i === correctIndex}
                onChange={() => set('correct_index', i)}
                title="Mark as correct answer"
                style={{ marginBottom: 10 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <MathTextField
                  label={`Choice ${String.fromCharCode(65 + i)}`}
                  value={choice}
                  onChange={(v) => setChoice(i, v)}
                />
              </div>
              <Button variant="remove" size="sm" disabled={choices.length <= 1} onClick={() => deleteChoice(i)} style={{ marginBottom: 6 }}>
                Delete
              </Button>
            </div>
          ))}
        </div>
        {choices.length < 2 && <span className={f.err}>Add at least two choices.</span>}
        <div style={{ marginTop: 8 }}>
          <Button variant="secondary" size="sm" onClick={addChoice}>+ Add choice</Button>
        </div>
      </div>
      )}

      <MathTextArea label="Explanation (shown after answering)" value={content.explanation} onChange={(v) => set('explanation', v)} rows={2} />

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <input
          type="checkbox"
          checked={Boolean(content.allow_retry)}
          onChange={(e) => set('allow_retry', e.target.checked)}
        />
        <span className={f.labelText}>Let the learner retry until correct</span>
      </label>
      {content.allow_retry && (
        <>
          <MathTextArea
            label="Hint (shown after a wrong answer)"
            value={content.hint}
            onChange={(v) => set('hint', v)}
            rows={2}
          />
          <MathTextArea
            label="Worked solution (revealed after 2 misses; falls back to the explanation)"
            value={content.solution}
            onChange={(v) => set('solution', v)}
            rows={4}
          />
        </>
      )}
    </Section>
  );
}
