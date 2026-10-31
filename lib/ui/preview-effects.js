// Shared client-side effects for rendering injected question
// HTML (stem / stimulus / options / rationale). Both the
// runner (lib/ui/QuestionRenderer.js) and the ACT-import
// review surface (app/next/(admin)/admin/act/imports/.../review)
// inject admin-authored HTML via dangerouslySetInnerHTML;
// once injected, two passes need to run after mount:
//
//   useMathTypeset    — typeset MathJax expressions that were
//                       written as \(…\), \[…\], or inline
//                       MathML. SVG-baked content (the
//                       architecture goal) is a no-op.
//
//   useQrefHighlight  — toggle .qref-active on the
//                       `<span class="qref" data-q="N">` marker
//                       whose data-q matches the active
//                       question's source_ordinal. The ACT
//                       English/Reading parsers emit these
//                       markers; SAT content has none and the
//                       effect short-circuits.
//
// Both hooks are scoped to a caller-provided ref so the same
// effect can serve multiple draft cards on one page without
// trampling each other.

'use client';

import { useEffect } from 'react';
import { typesetMath } from './mathjax-loader.ts';
import { observeAnswerChoiceMath } from './answer-choice-math.ts';

/** MathJax typeset for an HTML container.
 *
 *  Loads MathJax on demand and shares its download/typesetting queue.
 *  Pages containing only text or pre-rendered SVG never load the SDK.
 *
 *  `dependencyKey` should change whenever the container's HTML
 *  changes (e.g. question id, or the draft's stem text) so the
 *  effect re-runs and MathJax retypesets. */
export function useMathTypeset(ref, dependencyKey) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const el = ref.current;
    if (!el) return undefined;
    // Skip when the content has no math at all — saves a
    // typesetClear pass on every navigation.
    const html = el.innerHTML;
    const hasMath = /\\\(|\\\[|\$\$/.test(html) || el.querySelector('math');
    if (!hasMath && !el.querySelector('mjx-container')) return undefined;

    const choiceMath = observeAnswerChoiceMath(el);
    if (!hasMath) return () => choiceMath.dispose();

    let cancelled = false;
    typesetMath(el, () => !cancelled)
      .then(() => { if (!cancelled) choiceMath.refresh(); })
      .catch(() => {});
    return () => { cancelled = true; choiceMath.dispose(); };
  }, [ref, dependencyKey]);
}

/** Highlight a `[data-q="N"]` span inside the container. ACT
 *  English/Reading parsers emit these markers around the
 *  underlined-portion (English) or line-referenced span
 *  (Reading) each question targets; runner + review preview
 *  flip .qref-active on the marker whose data-q matches the
 *  active question's source_ordinal.
 *
 *  Passes through when qrefOrdinal is null/undefined (e.g.
 *  SAT questions, ACT math / science with no marker). */
export function useQrefHighlight(ref, qrefOrdinal, dependencyKey) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (qrefOrdinal == null) return undefined;
    const root = ref.current;
    if (!root) return undefined;
    // CSS.escape isn't strictly needed for a numeric attribute
    // but keeps the selector safe if we ever broaden the field.
    const safe =
      typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(qrefOrdinal)) : String(qrefOrdinal);
    const targets = root.querySelectorAll(`[data-q="${safe}"]`);
    targets.forEach(target => target.classList.add('qref-active'));
    return () => {
      targets.forEach(target => target.classList.remove('qref-active'));
    };
  }, [ref, qrefOrdinal, dependencyKey]);
}
