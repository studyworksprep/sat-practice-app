// Per-question technique tags, mounted beside ConceptTags in the
// review surfaces (docs/foundations-and-question-patterns.md §8).
//
// Deliberately NOT built into QuestionRenderer: that component is also
// mounted by TestRunnerInteractive, and anything added inside it shows
// up during a student's live test. The renderer already exposes a
// controlsNode slot, so every host passes this in the same way it
// passes ConceptTags — and the runner, which passes its own submit
// controls, can never receive it.
//
// Multi-select: a question is often solvable by several techniques
// (an H.A. equation by graphing AND by regression), and question_
// techniques is a junction. Two kinds of chip:
//   - default: the technique applies to every question in this
//     question's skill (technique_skills). Shown muted, not removable —
//     there are no per-question exclusions.
//   - tagged: an explicit question_techniques row. Removable.
// Adding picks from the catalog with this question's section first.

'use client';

import { useMemo, useState, useTransition } from 'react';
import { setQuestionTechniques } from './question-technique-actions';
import type { TechniqueOption } from './load-question-techniques';
import s from './QuestionTechniqueTags.module.css';

const MATH_DOMAINS = new Set(['H', 'P', 'Q', 'S']);

function sectionOfSkill(skillCode: string | null | undefined): 'math' | 'reading_writing' | null {
  if (!skillCode) return null;
  // Math skill codes are "H.A." style (domain letter + dot); R&W codes
  // are three letters. The domain letter is the reliable tell.
  return MATH_DOMAINS.has(skillCode.charAt(0)) && skillCode.charAt(1) === '.' ? 'math' : 'reading_writing';
}

export function QuestionTechniqueTags({
  questionId,
  skillCode,
  techniques = [],
  initialTechniqueIds = [],
  canTag = false,
  catalogHref = '/admin/techniques',
  showCatalogHint = false,
}: {
  questionId: string;
  skillCode: string | null | undefined;
  /** The whole catalog (with default skills); filtered/ordered here. */
  techniques?: TechniqueOption[];
  initialTechniqueIds?: string[];
  canTag?: boolean;
  catalogHref?: string;
  /** Admin-only nudge when the catalog is empty. */
  showCatalogHint?: boolean;
}) {
  const [techniqueIds, setTechniqueIds] = useState<string[]>(initialTechniqueIds);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const section = sectionOfSkill(skillCode);
  const byId = useMemo(() => new Map(techniques.map((t) => [t.id, t])), [techniques]);

  // Techniques that already apply to this question through its skill.
  const defaults = useMemo(
    () => (skillCode ? techniques.filter((t) => t.skillCodes.includes(skillCode)) : []),
    [techniques, skillCode],
  );
  const defaultIds = useMemo(() => new Set(defaults.map((t) => t.id)), [defaults]);
  const tagged = techniqueIds.map((id) => byId.get(id) ?? null);

  // Options for the add control: not already on the question, this
  // question's section (or both-section techniques) first.
  const addable = useMemo(() => {
    const taken = new Set([...techniqueIds, ...defaultIds]);
    const rest = techniques.filter((t) => !taken.has(t.id));
    const near = rest.filter((t) => !section || !t.section || t.section === section);
    const far = rest.filter((t) => section && t.section && t.section !== section);
    return { near, far };
  }, [techniques, techniqueIds, defaultIds, section]);

  if (!canTag) return null;

  if (techniques.length === 0 && techniqueIds.length === 0) {
    if (!showCatalogHint) return null;
    return (
      <p className={s.empty}>
        No techniques in the catalog yet —{' '}
        <a href={catalogHref} className={s.emptyLink}>
          add them
        </a>
        .
      </p>
    );
  }

  function save(next: string[]) {
    const previous = techniqueIds;
    setTechniqueIds(next);
    setNotice(null);
    startTransition(async () => {
      const res = await setQuestionTechniques({ questionId, techniqueIds: next });
      if (!res.ok) {
        setTechniqueIds(previous);
        setNotice({ kind: 'err', text: res.error });
        return;
      }
      setTechniqueIds(res.data.techniqueIds);
      setNotice({
        kind: 'ok',
        text: res.data.techniqueNames.length > 0
          ? `Tagged: ${res.data.techniqueNames.join(', ')}.`
          : 'Technique tags cleared.',
      });
    });
  }

  return (
    <div className={s.wrap}>
      <div className={s.row}>
        <span className={s.label} id={`technique-label-${questionId}`}>
          Techniques
        </span>
        <div className={s.chips}>
          {defaults.map((t) => (
            <span key={`d-${t.id}`} className={`${s.chip} ${s.chipDefault}`} title={`${t.description} — applies to every question in this skill`}>
              {t.name}
              <span className={s.chipNote}>skill default</span>
            </span>
          ))}
          {tagged.map((t, i) =>
            t ? (
              <span key={t.id} className={s.chip} title={t.description}>
                {t.name}
                <button
                  type="button"
                  className={s.chipRemove}
                  disabled={pending}
                  aria-label={`Remove ${t.name}`}
                  title="Remove"
                  onClick={() => save(techniqueIds.filter((id) => id !== t.id))}
                >
                  ×
                </button>
              </span>
            ) : (
              // A tag whose technique was deleted after page load.
              <span key={`gone-${i}`} className={`${s.chip} ${s.chipDefault}`}>
                Removed technique
                <button
                  type="button"
                  className={s.chipRemove}
                  disabled={pending}
                  aria-label="Remove"
                  onClick={() => save(techniqueIds.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </span>
            ),
          )}
          {addable.near.length + addable.far.length > 0 && (
            <select
              className={s.select}
              value=""
              disabled={pending}
              aria-labelledby={`technique-label-${questionId}`}
              onChange={(e) => {
                if (e.target.value) save([...techniqueIds, e.target.value]);
              }}
            >
              <option value="">+ Add technique…</option>
              {addable.near.length > 0 && (
                <optgroup label={section === 'math' ? 'Math' : section === 'reading_writing' ? 'Reading & Writing' : 'Techniques'}>
                  {addable.near.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
              )}
              {addable.far.length > 0 && (
                <optgroup label="Other section">
                  {addable.far.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
        </div>
      </div>

      {notice && (
        <p className={`${s.note} ${notice.kind === 'ok' ? s.ok : s.err}`} role="status">
          {notice.text}
        </p>
      )}
    </div>
  );
}
