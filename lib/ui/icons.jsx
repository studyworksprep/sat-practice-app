// Shared SVG icons for the new tree. 24×24 viewBox, currentColor
// strokes, fill: none. Stroke width is 1.75 (per the design-kit
// icons.html spec) — except for the Bookmark + Calculator icons
// pre-dating this rewrite, which keep their original 2.0 / 1.7
// strokes and `filled` semantics so the practice-test runner's
// active "Mark for Review" pill renders identically.
//
// SVG paths are ported from the design system's
// project/ui_kits/sat-practice-app/icons.html. That source is the
// canonical reference — when adding a new icon, copy the path
// from there rather than redrawing.
//
// Naming conventions:
//   - PascalCase + 'Icon' suffix (MathIcon, PerformanceIcon, …).
//   - Where the design-kit name and the in-tree name differ
//     historically (e.g. BarChartIcon vs Performance), the
//     design-kit name is the canonical export and the older
//     name is kept as an alias for backward compat.

function SvgRoot({ size = 18, strokeWidth = 1.75, className, children, ...rest }) {
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

// Chevron arrows — used by the practice-runner top bar's prev/next
// buttons. Stroke 2.0 to keep the glyph crisp inside the small
// 36×36 button square.
export function ChevronLeftIcon({ size = 16, className, ...rest }) {
  return (
    <SvgRoot size={size} strokeWidth={2} className={className} {...rest}>
      <polyline points="15 6 9 12 15 18" />
    </SvgRoot>
  );
}
export function ChevronRightIcon({ size = 16, className, ...rest }) {
  return (
    <SvgRoot size={size} strokeWidth={2} className={className} {...rest}>
      <polyline points="9 6 15 12 9 18" />
    </SvgRoot>
  );
}

// ──────────────────────────────────────────────────────────────
// Pre-existing — kept verbatim so the practice-test runner's
// existing visual stays unchanged across this design refresh.
// ──────────────────────────────────────────────────────────────

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

export function ReferenceIcon({ size = 18, className, ...rest }) {
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
      <path d="M4 4.5a1.5 1.5 0 0 1 1.5-1.5H18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 19.5v-15z" />
      <path d="M4 19.5a1.5 1.5 0 0 1 1.5-1.5H19" />
      <path d="M8 7h7" />
      <path d="M8 10.5h7" />
      <path d="M8 14h4" />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────
// Subjects & domains
// ──────────────────────────────────────────────────────────────

export function MathIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M4 8h7M7.5 4.5v7M14 7l5 5M14 12l5-5M5 17l3-3 3 3M14 18h5M14 16h5" />
    </SvgRoot>
  );
}

export function ReadingWritingIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M4 5h7a3 3 0 0 1 3 3v12" />
      <path d="M20 5h-3a3 3 0 0 0-3 3v12" />
      <path d="M4 5v13h7" />
      <path d="M20 5v13h-6" />
    </SvgRoot>
  );
}
/** @deprecated Use ReadingWritingIcon — kept for compatibility. */
export const BookOpenIcon = ReadingWritingIcon;

export function AlgebraIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M4 19V8M4 19h15M8 15v4M12 11v8M16 13v6M19 5l-3 3M16 8l-2-2" />
    </SvgRoot>
  );
}

export function AdvMathIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M4 20l5-9 4 5 7-13" />
      <circle cx="9" cy="11" r="1.4" />
      <circle cx="13" cy="16" r="1.4" />
    </SvgRoot>
  );
}

export function ProblemSolvingIcon(props) {
  return (
    <SvgRoot {...props}>
      <circle cx="9" cy="9" r="4.5" />
      <circle cx="16" cy="15" r="4" />
      <path d="M4 19h16" />
    </SvgRoot>
  );
}

export function DataAnalysisIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M3 12h7l1-3 2 6 1-3h7" />
    </SvgRoot>
  );
}

export function GeometryIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M4 20V4M4 20h16" />
      <path d="M4 14l4-4 3 2 5-7 4 4" />
    </SvgRoot>
  );
}

export function InformationIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M16 4v3h3" />
      <path d="M8 11h8M8 14h8M8 17h5" />
    </SvgRoot>
  );
}

export function CraftIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M4 6h13M4 12h11M4 18h7" />
      <path d="M19 5l1.5 1.5L19 8" />
    </SvgRoot>
  );
}

export function ExpressionIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M4 18l4-12 4 12M5.5 14h5" />
      <path d="M14 11h6M14 15h6M14 7h6" />
    </SvgRoot>
  );
}

export function StandardEnglishIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M5 5h11v14H5z" />
      <path d="M9 5v14" />
      <path d="M12 9h2M12 12h2M12 15h2" />
    </SvgRoot>
  );
}

// ──────────────────────────────────────────────────────────────
// People & roles
// ──────────────────────────────────────────────────────────────

export function StudentIcon(props) {
  return (
    <SvgRoot {...props}>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 19c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
    </SvgRoot>
  );
}

export function RosterIcon(props) {
  return (
    <SvgRoot {...props}>
      <circle cx="9" cy="10" r="3" />
      <circle cx="17" cy="10" r="3" />
      <path d="M3 19c1-3 3-4.5 6-4.5s5 1.5 6 4.5" />
      <path d="M14 19c.6-2 2-3.5 4-3.5s3 1 3.5 2.5" />
    </SvgRoot>
  );
}
/** @deprecated Use RosterIcon — kept for compatibility. */
export const UsersIcon = RosterIcon;

export function TutorIcon(props) {
  return (
    <SvgRoot {...props}>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 19c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
      <path d="M16 5l2 1.5-2 1.5" />
    </SvgRoot>
  );
}

export function ManagerIcon(props) {
  return (
    <SvgRoot {...props}>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 19c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
      <path d="M15.5 2l1 2 2 .5-1.5 1.5.5 2-2-1-2 1 .5-2L12.5 4.5l2-.5z" />
    </SvgRoot>
  );
}

export function GraduateIcon(props) {
  return (
    <SvgRoot {...props}>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 19c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
      <path d="M3 8l9-4 9 4-9 4z" />
    </SvgRoot>
  );
}
/** @deprecated Use GraduateIcon — kept for compatibility. */
export const GraduationCapIcon = GraduateIcon;

export function EnrolledIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M4 19v-2a4 4 0 0 1 4-4h4M16 16l2 2 4-4" />
      <circle cx="10" cy="8" r="3.5" />
    </SvgRoot>
  );
}

// ──────────────────────────────────────────────────────────────
// Performance & data
// ──────────────────────────────────────────────────────────────

export function PerformanceIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 16V11M12 16V7M16 16v-6" />
    </SvgRoot>
  );
}
/** @deprecated Use PerformanceIcon — kept for compatibility. */
export const BarChartIcon = PerformanceIcon;

export function ProgressIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M3 17l5-5 4 3 4-6 5 5" />
      <path d="M14 9h5v5" />
    </SvgRoot>
  );
}
/** @deprecated Use ProgressIcon — kept for compatibility. */
export const TrendingUpIcon = ProgressIcon;

export function ScoreIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M12 3l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />
    </SvgRoot>
  );
}

export function StreakIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M14 3c-3 4-7 5-7 9a5 5 0 0 0 10 0c0-1.5-.5-2.5-1-3.5" />
      <path d="M12 9c2 1 3 2.5 3 4.5" />
    </SvgRoot>
  );
}

export function GoalIcon(props) {
  return (
    <SvgRoot {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.4" />
    </SvgRoot>
  );
}
/** @deprecated Use GoalIcon — kept for compatibility. */
export const TargetIcon = GoalIcon;

export function AccuracyIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M12 3a9 9 0 1 0 9 9" />
      <path d="M12 12V3a9 9 0 0 1 9 9z" />
    </SvgRoot>
  );
}

export function TrendIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M4 18l4-4 4 2 5-8 3 4" />
    </SvgRoot>
  );
}

export function TimeSpentIcon(props) {
  return (
    <SvgRoot {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3.5 2" />
    </SvgRoot>
  );
}
/** @deprecated Use TimeSpentIcon — kept for compatibility. */
export const ClockIcon = TimeSpentIcon;

export function ImprovementIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M12 21V3" />
      <path d="M12 5l-4 3M12 5l4 3" />
      <path d="M12 13l-4 3M12 13l4 3" />
    </SvgRoot>
  );
}

export function ReportIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M4 5h16v3H4zM4 11h16v3H4zM4 17h16v3H4z" />
      <path d="M7 6.5h.01M7 12.5h.01M7 18.5h.01" />
    </SvgRoot>
  );
}

// ──────────────────────────────────────────────────────────────
// Activities
// ──────────────────────────────────────────────────────────────

export function QuestionBankIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M5 5h11l3 3v11H5z" />
      <path d="M9 5v14" />
      <path d="M12 10h4M12 13h4M12 16h3" />
    </SvgRoot>
  );
}

export function PracticeIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M7 5l12 7-12 7z" />
    </SvgRoot>
  );
}

export function ReviewIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M4 12a8 8 0 1 0 3-6.2" />
      <path d="M3 4v4h4" />
    </SvgRoot>
  );
}

export function MarkedIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M6 4h11v16l-5.5-3.5L6 20z" />
    </SvgRoot>
  );
}

export function CorrectIcon(props) {
  return (
    <SvgRoot {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </SvgRoot>
  );
}

export function IncorrectIcon(props) {
  return (
    <SvgRoot {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </SvgRoot>
  );
}

export function NotesIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M5 5h12l3 3v11H5z" />
      <path d="M9 11h7M9 14h7M9 17h4" />
    </SvgRoot>
  );
}

// Two stacked index cards — used for the Flashcards trigger so it
// reads as a study-card glyph distinct from QuestionNotes (single
// page) and TestIcon (sectioned paper). Back card is offset
// up-and-right from the front card; both have rounded corners.
export function FlashcardsIcon(props) {
  return (
    <SvgRoot {...props}>
      <rect x="7" y="3" width="14" height="10" rx="1.5" />
      <rect x="3" y="8" width="14" height="13" rx="1.5" />
      <path d="M6 13h8M6 16h6" />
    </SvgRoot>
  );
}

export function TestIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M5 4h14v6H5zM5 14h14v6H5z" />
      <path d="M8 7h6M8 17h6" />
    </SvgRoot>
  );
}

// ──────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────

export function SearchIcon(props) {
  return (
    <SvgRoot {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </SvgRoot>
  );
}

export function FilterIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M4 5h16l-6 8v6l-4 2v-8z" />
    </SvgRoot>
  );
}

export function SortIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M5 7h14M5 12h14M5 17h14" />
    </SvgRoot>
  );
}

export function CalendarIcon(props) {
  return (
    <SvgRoot {...props}>
      <rect x="4" y="5" width="16" height="15" rx="1" />
      <path d="M4 9h16" />
      <path d="M9 3v4M15 3v4" />
    </SvgRoot>
  );
}

export function NotificationIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </SvgRoot>
  );
}

export function SettingsIcon(props) {
  return (
    <SvgRoot {...props}>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M5.5 18.5l2-2M16.5 7.5l2-2" />
    </SvgRoot>
  );
}

export function HelpIcon(props) {
  return (
    <SvgRoot {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7" />
      <path d="M12 17h.01" />
    </SvgRoot>
  );
}

export function FeedbackIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M5 5h14v11H8l-3 3z" />
      <path d="M9 9h7M9 12h5" />
    </SvgRoot>
  );
}

export function InfoIcon(props) {
  return (
    <SvgRoot {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6" />
      <circle cx="12" cy="16.2" r=".7" fill="currentColor" stroke="none" />
    </SvgRoot>
  );
}

export function ResourceIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M12 4l8 4v5c0 4-3.5 6.5-8 7.5C7.5 19.5 4 17 4 13V8z" />
    </SvgRoot>
  );
}

// ──────────────────────────────────────────────────────────────
// Pre-existing tree icons that have no exact design-kit match.
// Kept so the icons commit doesn't break consumers that picked
// these specifically. Most render fine alongside the new
// design-kit set.
// ──────────────────────────────────────────────────────────────

export function PencilIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M17 3l4 4L7 21H3v-4z" />
      <path d="M14.5 5.5l4 4" />
    </SvgRoot>
  );
}

export function InboxIcon(props) {
  return (
    <SvgRoot {...props}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </SvgRoot>
  );
}

export function LayersIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M12 2L2 7l10 5 10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </SvgRoot>
  );
}

export function SparklesIcon(props) {
  return (
    <SvgRoot {...props}>
      <path d="M12 3l1.9 4.6L18 9.5l-4.1 1.9L12 16l-1.9-4.6L6 9.5l4.1-1.9z" />
      <path d="M19 14l.7 1.7L21.5 16.5l-1.8.8L19 19l-.7-1.7L16.5 16.5l1.8-.8z" />
    </SvgRoot>
  );
}

export function ClipboardCheckIcon(props) {
  return (
    <SvgRoot {...props}>
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M8 5H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3" />
      <path d="m9 14 2 2 4-4" />
    </SvgRoot>
  );
}
