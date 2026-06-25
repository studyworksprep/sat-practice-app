// Rich form editor for desmos_interactive block content.
//
// Ported from the legacy single-file editor
// (app/admin/lessons/[lessonId]/editor/page.js) into the (next)
// tree, restyled onto the shared field primitives + Button. The
// content shape and all parsing/serialisation helpers come from
// lib/lesson/desmos-form-utils.mjs and lib/lesson/desmos-interactive.mjs
// so the form stays in lockstep with parseDesmosInteractiveContent's
// schema and the runtime grader.
//
// onChange receives the full next content object. The parent applies
// cleanupDesmosContent so empty arrays/keys don't accumulate.

'use client';

import { Button } from '@/lib/ui/Button';
import {
  cleanupDesmosContent,
  createDesmosTemplate,
  parseCommaSeparatedList,
  parseLineSeparatedList,
  parseNumberList,
  parseSliderInitialValuesText,
  sliderInitialValuesToText,
} from '@/lib/lesson/desmos-form-utils.mjs';
import {
  Section,
  TextField,
  TextAreaField,
  NumberField,
  SelectField,
  CheckboxField,
} from './editor-fields';
import { MathTextArea } from './math-fields';
import f from '../../../forms.module.css';

const KNOWN_HINT_TRIGGERS = [
  'missing_y_equals',
  'uses_forbidden_variables',
  'likely_parentheses_error',
  'too_many_expressions',
  'too_few_expressions',
  'missing_required_slider',
  'slider_not_moved',
  'slider_still_default',
  'missing_second_expression',
  'expressions_not_comparable',
];

const rowBox = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  background: 'var(--card)',
};

export function DesmosBlockEditor({ content, onChange }) {
  const data = cleanupDesmosContent({
    ...content,
    type: 'desmos_interactive',
    initial_expressions: content.initial_expressions || [],
    goal: content.goal || { type: 'enter_expression', required_count: 1 },
    validation: content.validation || {
      mode: 'equivalent',
      expected: ['y=x'],
      test_values: [-2, 0, 2],
      tolerance: 0.000001,
      state_rules: { min_expressions: 1, max_expressions: 1, require_visible_only: true },
    },
    feedback: content.feedback || {
      success_message_html: '<p>Nice.</p>',
      retry_message_html: '<p>Try again.</p>',
    },
    progression: content.progression || { require_success: true },
  });

  function patch(nextPartial) {
    onChange({ ...data, ...nextPartial, type: 'desmos_interactive' });
  }

  function patchNested(path, value) {
    const keys = path.split('.');
    const next = structuredClone(data);
    let cursor = next;
    for (let i = 0; i < keys.length - 1; i += 1) {
      if (!cursor[keys[i]] || typeof cursor[keys[i]] !== 'object') cursor[keys[i]] = {};
      cursor = cursor[keys[i]];
    }
    cursor[keys[keys.length - 1]] = value;
    onChange(next);
  }

  function applyTemplate(kind, label) {
    if (confirm(`Replace this block's content with the "${label}" template?`)) {
      onChange(createDesmosTemplate(kind));
    }
  }

  const exprs = data.initial_expressions || [];
  const targetedHints = data.feedback?.targeted_hints || [];
  const attemptHints = data.feedback?.attempt_based_hints || [];
  const mode = data.validation?.mode || 'equivalent';

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Section title="Start from a template" hint="Templates replace the whole block. Edit the fields below afterward.">
        <div className={f.row}>
          <Button variant="secondary" size="sm" onClick={() => applyTemplate('enter', 'Enter expression')}>Enter expression</Button>
          <Button variant="secondary" size="sm" onClick={() => applyTemplate('compare', 'Compare two expressions')}>Compare two expressions</Button>
          <Button variant="secondary" size="sm" onClick={() => applyTemplate('slider_setup', 'Slider setup')}>Slider setup</Button>
          <Button variant="secondary" size="sm" onClick={() => applyTemplate('slider_move', 'Slider movement')}>Slider movement</Button>
        </div>
      </Section>

      <Section title="Basic info">
        <TextField label="Content id" value={data.id} onChange={(v) => patch({ id: v })} hint={!data.id ? 'A stable content.id is recommended.' : undefined} />
        <TextField label="Title" value={data.title} onChange={(v) => patch({ title: v })} />
      </Section>

      <Section title="Instructions">
        <MathTextArea label="Instructions (HTML) *" value={data.instructions_html} onChange={(v) => patch({ instructions_html: v })} rows={3} />
        {!data.instructions_html && <span className={f.err}>Instructions are required.</span>}
        <MathTextArea label="Caption (HTML)" value={data.caption_html} onChange={(v) => patch({ caption_html: v })} rows={2} />
      </Section>

      <Section title="Initial expressions" hint="Expressions pre-loaded into the calculator when the slide opens.">
        {exprs.map((expr, index) => (
          <div key={expr.id || index} style={rowBox}>
            <TextField label="Expression id" value={expr.id} onChange={(v) => {
              const list = [...exprs];
              list[index] = { ...list[index], id: v };
              patch({ initial_expressions: list });
            }} />
            <TextAreaField label="LaTeX" value={expr.latex} onChange={(v) => {
              const list = [...exprs];
              list[index] = { ...list[index], latex: v };
              patch({ initial_expressions: list });
            }} rows={2} mono />
            <CheckboxField label="Hidden" checked={expr.hidden} onChange={(c) => {
              const list = [...exprs];
              list[index] = { ...list[index], hidden: c };
              patch({ initial_expressions: list });
            }} />
            <div className={f.row}>
              <Button variant="secondary" size="sm" disabled={index === 0} onClick={() => {
                const list = [...exprs];
                [list[index - 1], list[index]] = [list[index], list[index - 1]];
                patch({ initial_expressions: list });
              }}>↑ Up</Button>
              <Button variant="secondary" size="sm" disabled={index >= exprs.length - 1} onClick={() => {
                const list = [...exprs];
                [list[index], list[index + 1]] = [list[index + 1], list[index]];
                patch({ initial_expressions: list });
              }}>↓ Down</Button>
              <Button variant="remove" size="sm" onClick={() => patch({ initial_expressions: exprs.filter((_, i) => i !== index) })}>Delete</Button>
            </div>
          </div>
        ))}
        <div>
          <Button variant="secondary" size="sm" onClick={() => patch({ initial_expressions: [...exprs, { id: `expr_${exprs.length + 1}`, latex: '', hidden: false }] })}>
            + Add expression
          </Button>
        </div>
      </Section>

      <Section title="Goal">
        <SelectField label="Goal type" value={data.goal?.type || 'enter_expression'} onChange={(v) => patchNested('goal.type', v)} options={['enter_expression', 'multi_expression']} />
        <NumberField label="Required count" value={data.goal?.required_count ?? 1} onChange={(v) => patchNested('goal.required_count', Number(v || 1))} />
        {data.goal?.type === 'multi_expression' && (
          <TextField label="Roles (comma-separated)" value={Array.isArray(data.goal?.roles) ? data.goal.roles.join(',') : ''} onChange={(v) => patchNested('goal.roles', parseCommaSeparatedList(v))} />
        )}
      </Section>

      <Section title="Validation">
        <SelectField label="Mode" value={mode} onChange={(v) => patchNested('validation.mode', v)} options={['normalized', 'equivalent', 'state', 'compare_expressions']} />
        {(mode === 'normalized' || mode === 'equivalent') && (
          <TextAreaField label="Expected expressions (one per line)" value={(data.validation?.expected || []).join('\n')} onChange={(v) => patchNested('validation.expected', parseLineSeparatedList(v))} rows={3} mono />
        )}
        {(mode === 'equivalent' || mode === 'compare_expressions') && (
          <>
            <TextField label="Test values (comma-separated numbers)" value={(data.validation?.test_values || []).join(', ')} onChange={(v) => patchNested('validation.test_values', parseNumberList(v))} />
            <NumberField label="Tolerance" value={data.validation?.tolerance ?? 0.000001} step="0.000001" onChange={(v) => patchNested('validation.tolerance', Number(v || 0.000001))} />
          </>
        )}
        {mode === 'compare_expressions' && (
          <SelectField label="Comparison" value={data.validation?.comparison || 'equivalent'} onChange={(v) => patchNested('validation.comparison', v)} options={['equivalent']} />
        )}
      </Section>

      <Section title="State rules" hint="Constraints checked against the calculator's expression list on submit.">
        <div className={f.grid}>
          <NumberField label="Min expressions" value={data.validation?.state_rules?.min_expressions ?? ''} onChange={(v) => patchNested('validation.state_rules.min_expressions', Number(v || 0))} />
          <NumberField label="Max expressions" value={data.validation?.state_rules?.max_expressions ?? ''} onChange={(v) => patchNested('validation.state_rules.max_expressions', Number(v || 0))} />
        </div>
        <CheckboxField label="require_visible_only" checked={data.validation?.state_rules?.require_visible_only} onChange={(c) => patchNested('validation.state_rules.require_visible_only', c)} />
        <TextField label="must_include_variables (comma-separated)" value={(data.validation?.state_rules?.must_include_variables || []).join(', ')} onChange={(v) => patchNested('validation.state_rules.must_include_variables', parseCommaSeparatedList(v))} />
        <TextField label="must_not_include_variables (comma-separated)" value={(data.validation?.state_rules?.must_not_include_variables || []).join(', ')} onChange={(v) => patchNested('validation.state_rules.must_not_include_variables', parseCommaSeparatedList(v))} />
        <TextField label="required_sliders (comma-separated)" value={(data.validation?.state_rules?.required_sliders || []).join(', ')} onChange={(v) => patchNested('validation.state_rules.required_sliders', parseCommaSeparatedList(v))} />
        <CheckboxField label="require_slider_creation" checked={data.validation?.state_rules?.require_slider_creation} onChange={(c) => patchNested('validation.state_rules.require_slider_creation', c)} />
        <CheckboxField label="require_slider_movement" checked={data.validation?.state_rules?.require_slider_movement} onChange={(c) => patchNested('validation.state_rules.require_slider_movement', c)} />
        <CheckboxField label="forbid_default_slider_values_on_submit" checked={data.validation?.state_rules?.forbid_default_slider_values_on_submit} onChange={(c) => patchNested('validation.state_rules.forbid_default_slider_values_on_submit', c)} />
        <TextAreaField label="slider_initial_values (key: value per line)" value={sliderInitialValuesToText(data.validation?.state_rules?.slider_initial_values || {})} onChange={(v) => patchNested('validation.state_rules.slider_initial_values', parseSliderInitialValuesText(v))} rows={2} mono />
      </Section>

      <Section title="Feedback">
        <MathTextArea label="Success message (HTML)" value={data.feedback?.success_message_html} onChange={(v) => patchNested('feedback.success_message_html', v)} rows={2} />
        <MathTextArea label="Retry message (HTML)" value={data.feedback?.retry_message_html} onChange={(v) => patchNested('feedback.retry_message_html', v)} rows={2} />
      </Section>

      <Section title="Targeted hints" hint="Shown when a specific mistake is detected.">
        {targetedHints.map((hint, index) => (
          <div key={`${hint.trigger || 'hint'}-${index}`} style={rowBox}>
            <SelectField label="Trigger" value={hint.trigger || KNOWN_HINT_TRIGGERS[0]} onChange={(v) => {
              const list = [...targetedHints];
              list[index] = { ...list[index], trigger: v };
              patchNested('feedback.targeted_hints', list);
            }} options={KNOWN_HINT_TRIGGERS} />
            <MathTextArea label="Message (HTML)" value={hint.message_html} onChange={(v) => {
              const list = [...targetedHints];
              list[index] = { ...list[index], message_html: v };
              patchNested('feedback.targeted_hints', list);
            }} rows={2} />
            <div className={f.row}>
              <Button variant="secondary" size="sm" disabled={index === 0} onClick={() => {
                const list = [...targetedHints];
                [list[index - 1], list[index]] = [list[index], list[index - 1]];
                patchNested('feedback.targeted_hints', list);
              }}>↑ Up</Button>
              <Button variant="secondary" size="sm" disabled={index >= targetedHints.length - 1} onClick={() => {
                const list = [...targetedHints];
                [list[index], list[index + 1]] = [list[index + 1], list[index]];
                patchNested('feedback.targeted_hints', list);
              }}>↓ Down</Button>
              <Button variant="remove" size="sm" onClick={() => patchNested('feedback.targeted_hints', targetedHints.filter((_, i) => i !== index))}>Delete</Button>
            </div>
          </div>
        ))}
        <div>
          <Button variant="secondary" size="sm" onClick={() => patchNested('feedback.targeted_hints', [...targetedHints, { trigger: 'missing_y_equals', message_html: '<p>Hint</p>' }])}>
            + Add targeted hint
          </Button>
        </div>
      </Section>

      <Section title="Attempt-based feedback" hint="Escalating help based on how many attempts the student has made.">
        {attemptHints.map((hint, index) => (
          <div key={`attempt-${index}`} style={rowBox}>
            <NumberField label="Min attempts" value={hint.min_attempts ?? 1} onChange={(v) => {
              const list = [...attemptHints];
              list[index] = { ...list[index], min_attempts: Number(v || 1) };
              patchNested('feedback.attempt_based_hints', list);
            }} />
            <MathTextArea label="Message (HTML)" value={hint.message_html} onChange={(v) => {
              const list = [...attemptHints];
              list[index] = { ...list[index], message_html: v };
              patchNested('feedback.attempt_based_hints', list);
            }} rows={2} />
            <div>
              <Button variant="remove" size="sm" onClick={() => patchNested('feedback.attempt_based_hints', attemptHints.filter((_, i) => i !== index))}>Delete</Button>
            </div>
          </div>
        ))}
        <div>
          <Button variant="secondary" size="sm" onClick={() => patchNested('feedback.attempt_based_hints', [...attemptHints, { min_attempts: 2, message_html: '<p>Hint after attempt 2</p>' }])}>
            + Add attempt hint
          </Button>
        </div>
        <NumberField label="Reveal solution after attempts" value={data.feedback?.reveal_solution_after_attempts ?? ''} onChange={(v) => patchNested('feedback.reveal_solution_after_attempts', v ? Number(v) : null)} />
        <MathTextArea label="Solution (HTML)" value={data.feedback?.solution_html} onChange={(v) => patchNested('feedback.solution_html', v)} rows={2} />
      </Section>

      <Section title="Progression">
        <CheckboxField label="Require success to continue" checked={data.progression?.require_success !== false} onChange={(c) => patchNested('progression.require_success', c)} />
      </Section>

      <Section title="Workflow / context" hint="Only needed for multi-step interactive workflows.">
        <TextField label="workflow_id" value={data.workflow_id} onChange={(v) => patch({ workflow_id: v })} />
        <div className={f.grid}>
          <NumberField label="step_index" value={data.step_index ?? ''} onChange={(v) => patch({ step_index: v ? Number(v) : null })} />
          <NumberField label="total_steps" value={data.total_steps ?? ''} onChange={(v) => patch({ total_steps: v ? Number(v) : null })} />
        </div>
        <TextField label="step_label" value={data.step_label} onChange={(v) => patch({ step_label: v })} />
        <CheckboxField label="inherit_from_previous_workflow_desmos" checked={data.inherit_from_previous_workflow_desmos} onChange={(c) => patch({ inherit_from_previous_workflow_desmos: c })} />
      </Section>
    </div>
  );
}
