// Shared SVG icons for the new tree. Small, stroke-based, drawn
// on a 24×24 viewBox so a single glyph scales cleanly across the
// top bar, popovers, and question navigation bubbles. `color` and
// fill come from currentColor so callers style tone via the
// parent's CSS (a className or a color prop).
//
// Each icon accepts a className so callers can tint it through
// their module CSS (the "gold-when-active" pattern in the test
// runner) without inline styles.
//
// Conventions for the section icons added below the original
// Bookmark / Calculator pair:
//   - 24×24 viewBox, stroke 1.7
//   - `aria-hidden` by default (decorative — caller adds an
//     accessible label on the surrounding element if needed)
//   - currentColor strokes/fills so a parent .iconGold etc. tint
//     each icon to its surface tone
// Paths derive from common UI vocabulary (Lucide / Feather
// shapes); stroke widths matched to the existing icons here.

function SvgRoot({ size = 18, strokeWidth = 1.7, className, children, ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  );
}

/**
 * Classic bookmark shape — used for the "Mark for Review" flag
 * throughout the practice-test runner, the module-review grid,
 * and the navigator popover. `filled` toggles between the hollow
 * outline (unmarked) and solid fill (marked) variants.
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

// ──────────────────────────────────────────────────────────────
// Section / domain icons. Used on card headers + empty states +
// page hero spots across the new tree. One icon per concept,
// re-used everywhere that concept shows up so a glance at the
// glyph means the same thing on every page.
// ──────────────────────────────────────────────────────────────

/** Roster / cohort of students. Two figures + heads. */
export function UsersIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </SvgRoot>
  );
}

/** Single student / individual learner. */
export function StudentIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </SvgRoot>
  );
}

/** Teacher / mentor — graduation cap. Used for teacher cards. */
export function GraduationCapIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M22 10v6" />
      <path d="M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </SvgRoot>
  );
}

/** Open book — practice tests + lessons. */
export function BookOpenIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </SvgRoot>
  );
}

/** Pencil — practice sessions, authoring. */
export function PencilIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M17 3l4 4L7 21H3v-4z" />
      <path d="M14.5 5.5l4 4" />
    </SvgRoot>
  );
}

/** Inbox — assignments hub. */
export function InboxIcon(props) {
  return (
    <SvgRoot {...props}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </SvgRoot>
  );
}

/** Bar chart — performance / analytics. */
export function BarChartIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </SvgRoot>
  );
}

/** Trend up — improvement / progress arrows. */
export function TrendingUpIcon(props) {
  return (
    <SvgRoot {...props}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </SvgRoot>
  );
}

/** Target / bullseye — training, focused practice. */
export function TargetIcon(props) {
  return (
    <SvgRoot {...props}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </SvgRoot>
  );
}

/** Stack of cards — flashcards. */
export function LayersIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M12 2L2 7l10 5 10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </SvgRoot>
  );
}

/** Sparkles — review, "smart" features. */
export function SparklesIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M12 3l1.9 4.6L18 9.5l-4.1 1.9L12 16l-1.9-4.6L6 9.5l4.1-1.9z" />
      <path d="M19 14l.7 1.7L21.5 16.5l-1.8.8L19 19l-.7-1.7L16.5 16.5l1.8-.8z" />
    </SvgRoot>
  );
}

/** Clipboard with check — completed / submitted assignments. */
export function ClipboardCheckIcon(props) {
  return (
    <SvgRoot {...props}>
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M8 5H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3" />
      <path d="m9 14 2 2 4-4" />
    </SvgRoot>
  );
}

/** Clock — timing, deadlines. */
export function ClockIcon(props) {
  return (
    <SvgRoot {...props}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </SvgRoot>
  );
}
