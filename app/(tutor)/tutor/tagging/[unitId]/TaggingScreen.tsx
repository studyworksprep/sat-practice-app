// The per-unit technique tagging screen — a client island written for
// a non-technical tagger (docs/foundations-and-question-patterns.md
// §8.5 step B).
//
// One question at a time, rendered by the shared QuestionRenderer in
// teacher mode with the answer and rationale in view; a sticky panel
// with the technique checkboxes (keys 1–9), "Save & next" (Enter),
// "Skip" (S / →), "Previous" (←), and a running "N of M tagged".
//
// The walk order is frozen when the screen opens or the order mode
// changes (lib/practice/tagging-order), so a question the tagger just
// saved does not jump out from under them; the live list feeds only
// the progress count. Question content is fetched on demand through
// loadTaggingQuestion (one step ahead is prefetched), never on mount —
// the first question arrives server-rendered.
//
// Techniques that already apply to every question in this unit's skill
// (technique_skills) are listed separately, without checkboxes: an
// explicit tag would be redundant, and the shortcuts stay on the ones
// that need a decision. Saving writes the question's whole explicit set
// through setQuestionTechniques(), the same manager-gated RPC path the
// review surfaces use.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/lib/ui/Button';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { setQuestionTechniques } from '@/lib/practice/question-technique-actions';
import type { TechniqueOption } from '@/lib/practice/load-question-techniques';
import type { TaggingQuestionVM } from '@/lib/practice/tagging-question';
import {
  TAGGING_ORDER_LABELS,
  orderQuestionsForTagging,
  sameIdSet,
  taggingProgress,
  type TaggingListItem,
  type TaggingOrder,
} from '@/lib/practice/tagging-order';
import { loadTaggingQuestion } from './actions';
import s from '../Tagging.module.css';

export interface TaggingUnit {
  id: string;
  title: string;
  skillCode: string;
  skillName: string;
  domainName: string;
  section: 'math' | 'reading_writing';
}

const SHORTCUT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function TaggingScreen({
  unit,
  techniques,
  questions,
  initialQuestion,
  indexHref,
  catalogHref,
}: {
  unit: TaggingUnit;
  techniques: TechniqueOption[];
  questions: TaggingListItem[];
  /** The first question in "untagged first" order, server-rendered. */
  initialQuestion: TaggingQuestionVM | null;
  indexHref: string;
  /** Admins get a link to the catalog; null for managers. */
  catalogHref: string | null;
}) {
  const [order, setOrder] = useState<TaggingOrder>('untagged_first');
  const [items, setItems] = useState<TaggingListItem[]>(questions);
  const [orderedIds, setOrderedIds] = useState<string[]>(() =>
    orderQuestionsForTagging(questions, 'untagged_first'),
  );
  const [index, setIndex] = useState(0);
  const [cache, setCache] = useState<Record<string, TaggingQuestionVM>>(() =>
    initialQuestion ? { [initialQuestion.questionId]: initialQuestion } : {},
  );
  const inFlight = useRef(new Set<string>());
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>(
    () => questions.find((q) => q.id === orderedIds[0])?.techniqueIds ?? [],
  );
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const itemsById = useMemo(() => new Map(items.map((q) => [q.id, q])), [items]);
  const currentId = orderedIds[index] ?? null;
  const current = currentId ? (itemsById.get(currentId) ?? null) : null;
  const vm = currentId ? (cache[currentId] ?? null) : null;
  const progress = taggingProgress(items);
  const finished = orderedIds.length > 0 && index >= orderedIds.length;

  // Techniques that already count for every question in this skill,
  // and the ones a tagger actually decides on (unit's section first).
  const defaults = useMemo(
    () => techniques.filter((t) => t.skillCodes.includes(unit.skillCode)),
    [techniques, unit.skillCode],
  );
  const selectable = useMemo(() => {
    const rest = techniques.filter((t) => !t.skillCodes.includes(unit.skillCode));
    const near = rest.filter((t) => !t.section || t.section === unit.section);
    const far = rest.filter((t) => t.section && t.section !== unit.section);
    return { near, far, all: [...near, ...far] };
  }, [techniques, unit.skillCode, unit.section]);

  const changed = current ? !sameIdSet(draft, current.techniqueIds) : false;

  const ensureLoaded = useCallback(
    async (id: string | undefined) => {
      if (!id || cache[id] || inFlight.current.has(id)) return;
      inFlight.current.add(id);
      try {
        const res = await loadTaggingQuestion({ questionId: id });
        if (res.ok) setCache((c) => ({ ...c, [id]: res.data }));
      } finally {
        inFlight.current.delete(id);
      }
    },
    [cache],
  );

  const goTo = useCallback(
    async (i: number) => {
      const id = orderedIds[i];
      setIndex(i);
      setNotice(null);
      setDraft(id ? (itemsById.get(id)?.techniqueIds ?? []) : []);
      if (id && !cache[id]) {
        setLoadingId(id);
        await ensureLoaded(id);
        setLoadingId(null);
      }
      // One step ahead, so "next" is instant.
      void ensureLoaded(orderedIds[i + 1]);
    },
    [orderedIds, itemsById, cache, ensureLoaded],
  );

  function changeOrder(next: TaggingOrder) {
    const ids = orderQuestionsForTagging(items, next);
    setOrder(next);
    setOrderedIds(ids);
    setIndex(0);
    setNotice(null);
    setDraft(ids[0] ? (itemsById.get(ids[0])?.techniqueIds ?? []) : []);
    if (ids[0] && !cache[ids[0]]) {
      setLoadingId(ids[0]);
      void ensureLoaded(ids[0]).then(() => setLoadingId(null));
    }
    void ensureLoaded(ids[1]);
  }

  const save = useCallback(() => {
    if (!current || pending) return;
    if (!changed) {
      void goTo(index + 1);
      return;
    }
    const id = current.id;
    const next = [...draft];
    startTransition(async () => {
      const res = await setQuestionTechniques({ questionId: id, techniqueIds: next });
      if (!res.ok) {
        setNotice({ kind: 'err', text: res.error });
        return;
      }
      setItems((prev) => prev.map((q) => (q.id === id ? { ...q, techniqueIds: res.data.techniqueIds } : q)));
      await goTo(index + 1);
      setNotice({
        kind: 'ok',
        text:
          res.data.techniqueNames.length > 0
            ? `Saved ${current.displayCode ?? 'question'}: ${res.data.techniqueNames.join(', ')}.`
            : `Saved ${current.displayCode ?? 'question'} with no technique tags.`,
      });
    });
  }, [current, pending, changed, draft, index, goTo]);

  const skip = useCallback(() => {
    if (!current || pending) return;
    void goTo(index + 1);
  }, [current, pending, index, goTo]);

  const prev = useCallback(() => {
    if (pending || index === 0) return;
    void goTo(index - 1);
  }, [pending, index, goTo]);

  const toggle = useCallback(
    (techniqueId: string) => {
      if (pending) return;
      setDraft((d) => (d.includes(techniqueId) ? d.filter((x) => x !== techniqueId) : [...d, techniqueId]));
    },
    [pending],
  );

  // Keyboard shortcuts. The handlers live in a ref so the listener is
  // attached once and always sees the latest state.
  const handlers = useRef({ save, skip, prev, toggle, selectable: selectable.all, finished });
  handlers.current = { save, skip, prev, toggle, selectable: selectable.all, finished };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || isTypingTarget(e.target)) return;
      const h = handlers.current;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!h.finished) h.save();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (!h.finished) h.skip();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        h.prev();
        return;
      }
      const n = SHORTCUT_KEYS.indexOf(e.key);
      if (n >= 0 && n < h.selectable.length && !h.finished) {
        e.preventDefault();
        h.toggle(h.selectable[n].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (questions.length === 0) {
    return (
      <p className={s.empty}>
        This unit has no published questions to tag yet.{' '}
        <Link href={indexHref}>Back to all units</Link>.
      </p>
    );
  }

  const shortcutFor = (t: TechniqueOption) => {
    const i = selectable.all.findIndex((x) => x.id === t.id);
    return i >= 0 && i < SHORTCUT_KEYS.length ? SHORTCUT_KEYS[i] : null;
  };

  const renderTechnique = (t: TechniqueOption) => {
    const checked = draft.includes(t.id);
    const key = shortcutFor(t);
    return (
      <button
        key={t.id}
        type="button"
        className={s.techniqueRow}
        data-checked={checked ? 'true' : 'false'}
        aria-pressed={checked}
        disabled={pending || finished || !current}
        onClick={() => toggle(t.id)}
        title={t.description}
      >
        <span className={s.key} aria-hidden="true">{key ?? (checked ? '✓' : ' ')}</span>
        <span className={s.techniqueBody}>
          <span className={s.techniqueName}>{checked ? '☑ ' : '☐ '}{t.name}</span>
          <br />
          <span className={s.techniqueCue}>{t.description}</span>
        </span>
      </button>
    );
  };

  return (
    <div className={s.layout}>
      <section className={s.questionPane} aria-live="polite">
        {finished || !current ? (
          <div className={s.endCard}>
            <h2>{order === 'tagged_only' ? 'That is every tagged question.' : 'You reached the end of this unit.'}</h2>
            <p>
              {progress.tagged} of {progress.total} question{progress.total === 1 ? '' : 's'} carry a technique tag.
              {progress.tagged < progress.total && order === 'untagged_first'
                ? ' The ones you skipped are still untagged — start over to see them again.'
                : ''}
            </p>
            <div className={s.actions}>
              <Button variant="primary" onClick={() => changeOrder('untagged_first')}>
                Start over with untagged
              </Button>
              <Button variant="secondary" href={indexHref}>
                All units
              </Button>
            </div>
          </div>
        ) : vm ? (
          <QuestionRenderer
            key={vm.questionId}
            mode="teacher"
            layout="single"
            question={vm}
            result={vm.result}
            subject={vm.subject}
          />
        ) : (
          <p className={s.loading}>{loadingId ? 'Loading question…' : 'This question could not be loaded.'}</p>
        )}
      </section>

      <aside className={s.panel} aria-label="Technique tags">
        <div className={s.panelHead}>
          <span className={s.progressBig}>
            {progress.tagged} of {progress.total} tagged
          </span>
          <span className={s.position}>
            {finished || !current
              ? 'Done'
              : `Question ${index + 1} of ${orderedIds.length}${current.displayCode ? ` · ${current.displayCode}` : ''}`}
          </span>
        </div>
        <div className={s.bar} role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.tagged}>
          <div className={s.fill} style={{ width: `${progress.total ? Math.round((progress.tagged / progress.total) * 100) : 0}%` }} />
        </div>

        <label className={s.orderRow}>
          <span>Order</span>
          <select value={order} disabled={pending} onChange={(e) => changeOrder(e.target.value as TaggingOrder)}>
            {(Object.keys(TAGGING_ORDER_LABELS) as TaggingOrder[]).map((k) => (
              <option key={k} value={k}>{TAGGING_ORDER_LABELS[k]}</option>
            ))}
          </select>
        </label>

        {defaults.length > 0 && (
          <div className={s.defaults}>
            Already counts for every {unit.skillName} question:{' '}
            <strong>{defaults.map((t) => t.name).join(', ')}</strong>. No tag needed for those.
          </div>
        )}

        {vm?.suggestions && vm.suggestions.length > 0 && (
          <div>
            <p className={s.groupTitle}>Suggested</p>
            <div className={s.suggestions}>
              {vm.suggestions.map((sg) => (
                <button key={sg.techniqueId} type="button" className={s.suggestion} title={sg.reason} onClick={() => toggle(sg.techniqueId)}>
                  + {techniques.find((t) => t.id === sg.techniqueId)?.name ?? 'Technique'}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectable.all.length === 0 ? (
          <p className={s.muted}>
            {techniques.length === 0 ? 'No techniques in the catalog yet.' : 'Every technique in the catalog already applies to this unit by default.'}
            {catalogHref ? (
              <>
                {' '}
                <Link href={catalogHref}>Manage techniques</Link>.
              </>
            ) : null}
          </p>
        ) : (
          <>
            <p className={s.groupTitle}>Which techniques solve this question?</p>
            <div className={s.techniqueList}>{selectable.near.map(renderTechnique)}</div>
            {selectable.far.length > 0 && (
              <>
                <p className={s.groupTitle}>Other section</p>
                <div className={s.techniqueList}>{selectable.far.map(renderTechnique)}</div>
              </>
            )}
          </>
        )}

        {notice && (
          <p className={`${s.notice} ${notice.kind === 'ok' ? s.ok : s.err}`} role="status">
            {notice.text}
          </p>
        )}

        <div className={s.actions}>
          <Button variant="primary" onClick={save} disabled={pending || finished || !current}>
            {pending ? 'Saving…' : changed ? 'Save & next' : 'Next'}
          </Button>
          <Button variant="secondary" onClick={skip} disabled={pending || finished || !current}>
            Skip
          </Button>
          <Button variant="secondary" onClick={prev} disabled={pending || index === 0}>
            ← Previous
          </Button>
        </div>
        <p className={s.shortcuts}>
          <kbd>1</kbd>–<kbd>9</kbd> toggle a technique · <kbd>Enter</kbd> save &amp; next · <kbd>S</kbd> or <kbd>→</kbd> skip ·{' '}
          <kbd>←</kbd> previous
        </p>
      </aside>
    </div>
  );
}
