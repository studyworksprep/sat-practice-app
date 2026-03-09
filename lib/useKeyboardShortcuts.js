'use client';

import { useEffect } from 'react';

/**
 * Hook to handle keyboard shortcuts for question navigation and actions.
 *
 * @param {Object} handlers
 * @param {Function} [handlers.onPrev]      - Go to previous question (ArrowLeft)
 * @param {Function} [handlers.onNext]      - Go to next question (ArrowRight)
 * @param {Function} [handlers.onSubmit]    - Submit answer (Enter)
 * @param {Function} [handlers.onMark]      - Toggle mark for review (m)
 * @param {Function} [handlers.onExplain]   - Toggle explanation (e)
 * @param {Function} [handlers.onMap]       - Toggle question map (q)
 * @param {Object}   [options]
 * @param {boolean}  [options.enabled=true] - Whether shortcuts are active
 */
export function useKeyboardShortcuts(handlers, options = {}) {
  const { enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e) {
      // Don't intercept when user is typing in an input, textarea, or contentEditable
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) {
        return;
      }

      // Don't intercept when modifier keys are held (except Shift for some)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case 'ArrowLeft':
          if (handlers.onPrev) {
            e.preventDefault();
            handlers.onPrev();
          }
          break;

        case 'ArrowRight':
          if (handlers.onNext) {
            e.preventDefault();
            handlers.onNext();
          }
          break;

        case 'Enter':
          if (handlers.onSubmit) {
            e.preventDefault();
            handlers.onSubmit();
          }
          break;

        case 'm':
        case 'M':
          if (handlers.onMark) {
            e.preventDefault();
            handlers.onMark();
          }
          break;

        case 'e':
        case 'E':
          if (handlers.onExplain) {
            e.preventDefault();
            handlers.onExplain();
          }
          break;

        case 'q':
        case 'Q':
          if (handlers.onMap) {
            e.preventDefault();
            handlers.onMap();
          }
          break;

        case '1':
        case '2':
        case '3':
        case '4':
          if (handlers.onSelectOption) {
            e.preventDefault();
            handlers.onSelectOption(Number(e.key) - 1);
          }
          break;

        default:
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers, enabled]);
}
