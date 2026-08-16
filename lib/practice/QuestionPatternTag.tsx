// Per-question pattern picker, mounted beside ConceptTags in the
// review surfaces (docs/foundations-and-question-patterns.md §3.4
// step 2).
//
// Deliberately NOT built into QuestionRenderer: that component is also
// mounted by TestRunnerInteractive, and anything added inside it shows
// up during a student's live test. The renderer already exposes a
// controlsNode slot, so every host passes this in the same way it
// passes ConceptTags — and the runner, which passes its own submit
// controls, can never receive it.
//
// Single-select, not chips: one primary pattern per question is the
// decision in doc §6, and questions_v2.pattern_id is a scalar FK.
//
// The options are scoped to the question's own skill, so the tutor
// picks from the 2-6 patterns that could possibly apply rather than
// the whole catalog. That scoping is what makes opportunistic tagging
// during a review actually happen instead of getting skipped.

'use client';

import { useMemo, useState, useTransition } from 'react';
import { setQuestionPattern } from './question-pattern-actions';
import type { PatternOption } from './load-question-patterns';
import s from './QuestionPatternTag.module.css';

export function QuestionPatternTag({
  questionId,
  skillCode,
  patterns = [],
  initialPatternId = null,
  canTag = false,
  catalogHref = '/admin/content/patterns',
  showCatalogHint = false,
}: {
  questionId: string;
  skillCode: string | null | undefined;
  /** Catalog for this page; filtered to the question's skill here. */
  patterns?: PatternOption[];
  initialPatternId?: string | null;
  canTag?: boolean;
  catalogHref?: string;
  /** Admin-only nudge when the skill has no patterns drafted yet. */
  showCatalogHint?: boolean;
}) {
  const [patternId, setPatternId] = useState<string | null>(initialPatternId);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const options = useMemo(
    () =>
      skillCode ? patterns.filter((p) => p.skill_code === skillCode) : [],
    [patterns, skillCode],
  );

  const selected = options.find((p) => p.id === patternId) ?? null;

  if (!canTag) return null;

  // Nothing to offer and nothing already set: stay out of the way.
  // Most questions never carry a pattern, and an empty control on
  // every question would read as an unfinished task.
  if (options.length === 0 && !patternId) {
    if (!showCatalogHint) return null;
    return (
      <p className={s.empty}>
        No patterns drafted for this skill —{' '}
        <a href={catalogHref} className={s.emptyLink}>
          add them to the catalog
        </a>
        .
      </p>
    );
  }

  function save(next: string | null) {
    const previous = patternId;
    setPatternId(next);
    setNotice(null);
    startTransition(async () => {
      const res = await setQuestionPattern({ questionId, patternId: next });
      if (!res.ok) {
        setPatternId(previous);
        setNotice({ kind: 'err', text: res.error });
        return;
      }
      setPatternId(res.data.patternId);
      setNotice({
        kind: 'ok',
        text: res.data.patternName ? `Tagged “${res.data.patternName}”.` : 'Pattern cleared.',
      });
    });
  }

  return (
    <div className={s.wrap}>
      <div className={s.row}>
        <span className={s.label} id={`pattern-label-${questionId}`}>
          Pattern
        </span>
        <select
          className={s.select}
          value={patternId ?? ''}
          disabled={pending}
          aria-labelledby={`pattern-label-${questionId}`}
          onChange={(e) => save(e.target.value || null)}
        >
          <option value="">Not tagged</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sequence}. {p.name}
            </option>
          ))}
          {/* A tag pointing outside this skill's list can only come
              from a pattern that was moved after tagging. Keep it
              selectable so the tutor can see and clear it. */}
          {patternId && !selected && <option value={patternId}>Tagged (other skill)</option>}
        </select>
        {patternId && (
          <button type="button" className={s.clear} onClick={() => save(null)} disabled={pending}>
            Clear
          </button>
        )}
      </div>

      {selected && <p className={s.cue}>{selected.recognition_cue}</p>}

      {notice && (
        <p className={`${s.note} ${notice.kind === 'ok' ? s.ok : s.err}`} role="status">
          {notice.text}
        </p>
      )}
    </div>
  );
}
