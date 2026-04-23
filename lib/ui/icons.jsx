// Shared SVG icons for the new tree. Small, stroke-based, drawn
// on a 24×24 viewBox so a single glyph scales cleanly across the
// top bar, popovers, and question navigation bubbles. `color` and
// fill come from currentColor so callers style tone via the
// parent's CSS (a className or a color prop).
//
// Each icon accepts a className so callers can tint it through
// their module CSS (the "gold-when-active" pattern in the test
// runner) without inline styles.

/**
 * Classic bookmark shape — used for the "Mark for Review" flag
 * throughout the practice-test runner, the module-review grid,
 * and the navigator popover. `filled` toggles between the hollow
 * outline (unmarked) and solid fill (marked) variants.
 *
 * @param {object} props
 * @param {boolean} [props.filled]
 * @param {number}  [props.size]
 * @param {string}  [props.className]
 */
export function BookmarkIcon({ filled = false, size = 18, className, ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/**
 * Simple calculator icon — a bordered body with a screen bar at
 * the top and a 3×3 grid of button dots. Stroke-based so it sits
 * next to text on the top bar without looking heavier than the
 * surrounding controls.
 *
 * @param {object} props
 * @param {number} [props.size]
 * @param {string} [props.className]
 */
export function CalculatorIcon({ size = 18, className, ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <rect x="4" y="2.5" width="16" height="19" rx="2" />
      <rect x="7" y="5.5" width="10" height="3" rx="0.5" />
      <circle cx="8"  cy="13" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="13" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16" cy="13" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="8"  cy="16.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="8"  cy="20" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="20" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16" cy="20" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
