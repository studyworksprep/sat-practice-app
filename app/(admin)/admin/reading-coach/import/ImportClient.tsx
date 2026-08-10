// Client component for the Reading Coach import UX.
//
// Textarea state is local; every change re-parses and re-validates
// with the same functions the Server Action runs, so the preview
// (including sanitized HTML) is exactly what the server would store.
// The client pass is courtesy, not authority.

'use client';

import { useActionState, useMemo, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import {
  parseReadingCoachItemSpecText,
  validateReadingCoachItemSpec,
} from '@/lib/reading-coach/schema';
import type { ReadingCoachItemSpec, ValidationIssue } from '@/lib/reading-coach/types';
import { importReadingCoachSpec } from '../actions';
import f from '../../../forms.module.css';

type Analysis =
  | { state: 'empty' }
  | { state: 'parse_error'; message: string }
  | { state: 'invalid'; errors: ValidationIssue[] }
  | { state: 'valid'; spec: ReadingCoachItemSpec; publishBlockers: ValidationIssue[] };

function analyze(text: string): Analysis {
  if (!text.trim()) return { state: 'empty' };
  const parsed = parseReadingCoachItemSpecText(text);
  if ('error' in parsed) return { state: 'parse_error', message: parsed.error };
  const validated = validateReadingCoachItemSpec(parsed.spec);
  if (!validated.ok) return { state: 'invalid', errors: validated.errors };
  const publishCheck = validateReadingCoachItemSpec(parsed.spec, { forPublish: true });
  return {
    state: 'valid',
    spec: validated.spec,
    publishBlockers: publishCheck.ok ? [] : publishCheck.errors,
  };
}

export function ImportClient() {
  const [text, setText] = useState('');
  const analysis = useMemo(() => analyze(text), [text]);
  const [result, formAction, pending] = useActionState(importReadingCoachSpec, null);

  return (
    <form action={formAction} className={f.form}>
      <label className={f.label}>
        <span className={f.labelText}>ReadingCoachItemSpec JSON</span>
        <textarea
          name="spec"
          className={f.input}
          rows={18}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder='{ "slug": "…", "title": "…", … }'
        />
      </label>

      {analysis.state === 'parse_error' && (
        <p className={f.err}>JSON parse error: {analysis.message}</p>
      )}

      {analysis.state === 'invalid' && (
        <div className={f.err}>
          <p>Validation errors ({analysis.errors.length}):</p>
          <ul>
            {analysis.errors.map((e, i) => (
              <li key={i}>
                <code>{e.path || '(root)'}</code>: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.state === 'valid' && (
        <SpecPreview spec={analysis.spec} publishBlockers={analysis.publishBlockers} />
      )}

      {result && result.ok === false && (
        <p className={f.err}>{String(result.error)}</p>
      )}

      <div className={f.actions}>
        <Button type="submit" disabled={pending || analysis.state !== 'valid'}>
          {pending ? 'Saving draft…' : 'Save as draft'}
        </Button>
      </div>
    </form>
  );
}

function List({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <p className={f.hint}>
      <strong>{label}:</strong> {values.join(' · ')}
    </p>
  );
}

function SpecPreview({
  spec,
  publishBlockers,
}: {
  spec: ReadingCoachItemSpec;
  publishBlockers: ValidationIssue[];
}) {
  return (
    <div className={f.fieldset}>
      <p className={f.ok}>
        Valid spec: <strong>{spec.title}</strong> ({spec.slug}) — {spec.genre},
        difficulty {spec.difficulty}, {spec.taskType}, {spec.processingMode},
        rights {spec.source.rightsStatus}
        {spec.source.author ? `, ${spec.source.author}` : ''}
        {spec.source.year ? ` (${spec.source.year})` : ''}
      </p>
      {publishBlockers.length > 0 && (
        <p className={f.hint}>
          Will save as draft but cannot publish yet:{' '}
          {publishBlockers.map((e) => e.message).join(' ')}
        </p>
      )}

      <h3 className={f.subhead}>Question stem</h3>
      {/* Sanitized by the validator before it reaches this preview. */}
      <div dangerouslySetInnerHTML={{ __html: spec.questionStemHtml }} />

      <h3 className={f.subhead}>Passage</h3>
      <div dangerouslySetInnerHTML={{ __html: spec.passageHtml }} />

      <h3 className={f.subhead}>Task rubric</h3>
      <p className={f.hint}>{spec.taskRubric.canonicalTask}</p>
      <List label="Required ideas" values={spec.taskRubric.requiredIdeas} />
      <List label="Acceptable variants" values={spec.taskRubric.acceptableVariants} />
      <List label="Common wrong tasks" values={spec.taskRubric.commonWrongTasks} />

      <h3 className={f.subhead}>
        Processing units ({spec.processingUnits.length})
      </h3>
      {spec.processingUnits.map((u) => (
        <div key={u.key}>
          <p className={f.hint}>
            <strong>{u.key}</strong>
          </p>
          <div dangerouslySetInnerHTML={{ __html: u.textHtml }} />
          <List label="Required ideas" values={u.requiredIdeas} />
          <List label="Required relations" values={u.requiredRelations} />
          <List label="Acceptable omissions" values={u.acceptableOmissions} />
          <List label="Prohibited distortions" values={u.prohibitedDistortions} />
        </div>
      ))}

      <h3 className={f.subhead}>Passage rubric</h3>
      <p className={f.hint}>{spec.passageRubric.canonicalSummary}</p>
      <List label="Required ideas" values={spec.passageRubric.requiredIdeas} />
      <List label="Required relations" values={spec.passageRubric.requiredRelations} />
      <List label="Acceptable omissions" values={spec.passageRubric.acceptableOmissions} />
      <List label="Prohibited distortions" values={spec.passageRubric.prohibitedDistortions} />

      <h3 className={f.subhead}>Pre-answer rubric</h3>
      <p className={f.hint}>{spec.preanswerRubric.canonicalPreanswer}</p>
      <List label="Required ideas" values={spec.preanswerRubric.requiredIdeas} />
      <List label="Acceptable variants" values={spec.preanswerRubric.acceptableVariants} />
      <List label="Prohibited claims" values={spec.preanswerRubric.prohibitedClaims} />

      <h3 className={f.subhead}>Choices</h3>
      {spec.choices.map((c) => (
        <div key={c.label}>
          <p className={f.hint}>
            <strong>
              {c.label}
              {c.correct ? ' ✓ correct' : ''}
            </strong>
            {c.errorCode ? ` — ${c.errorCode}` : ''}
          </p>
          <div dangerouslySetInnerHTML={{ __html: c.html }} />
          <div className={f.muted} dangerouslySetInnerHTML={{ __html: c.rationaleHtml }} />
        </div>
      ))}
    </div>
  );
}
