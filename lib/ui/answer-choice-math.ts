// Fit indivisible CHTML equations to their answer choice. Restore the
// authored size before each measurement so widening a pane enlarges math
// again, and repeated typesetting never compounds a previous reduction.
export function observeAnswerChoiceMath(root: HTMLElement) {
  const choices = [...root.querySelectorAll<HTMLElement>('.sw-option-content')];
  if (root.matches?.('.sw-option-content')) choices.unshift(root);
  if (choices.length === 0) return { refresh() {}, dispose() {} };
  const originals = new Map<HTMLElement, { value: string; priority: string }>();
  let frame: number | null = null;
  let disposed = false;

  function restore(math: HTMLElement, original: { value: string; priority: string }) {
    if (original.value) math.style.setProperty('font-size', original.value, original.priority);
    else math.style.removeProperty('font-size');
  }

  function fit() {
    frame = null;
    if (disposed) return;
    for (const choice of choices) {
      const style = getComputedStyle(choice);
      const scale = choice.offsetWidth > 0 ? choice.getBoundingClientRect().width / choice.offsetWidth : 1;
      const available = (choice.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) * scale;
      if (available <= 1) continue;
      for (const math of choice.querySelectorAll<HTMLElement>('mjx-container[jax="CHTML"]')) {
        if (!originals.has(math)) originals.set(math, {
          value: math.style.getPropertyValue('font-size'),
          priority: math.style.getPropertyPriority('font-size'),
        });
        const original = originals.get(math)!;
        restore(math, original);
        // Inline MathJax containers can have zero scrollWidth. The visual
        // bounds also account for page/presenter zoom on both sides.
        const width = Math.max(math.getBoundingClientRect().width, math.scrollWidth * scale);
        if (width > available) {
          const fontSize = parseFloat(getComputedStyle(math).fontSize);
          math.style.setProperty('font-size', `${fontSize * (available - 1) / width}px`, original.priority);
        }
      }
    }
  }

  function refresh() {
    if (!disposed && frame == null) frame = requestAnimationFrame(fit);
  }

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
  choices.forEach((choice) => observer?.observe(choice));
  window.addEventListener('resize', refresh);
  document.fonts?.addEventListener('loadingdone', refresh);
  refresh();

  return {
    refresh,
    dispose() {
      disposed = true;
      if (frame != null) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', refresh);
      document.fonts?.removeEventListener('loadingdone', refresh);
      for (const [math, original] of originals) restore(math, original);
    },
  };
}
