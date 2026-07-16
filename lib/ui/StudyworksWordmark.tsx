// Inline SVG wordmark, shared by AppNav (top bar) and AppSidebar.
// Inlined rather than served from /studyworks-logo.svg so the markup
// ships with the layout and the DOM <svg> node persists across child-
// page navigations — the prior <img> approach caused a visible flicker
// each time the runner advanced a position because the file was being
// re-validated on every navigation. The shapes + colors come straight
// from the design-system asset.
//
// variant="full" — the two-gear wordmark with the Studyworks text.
// variant="mark" — the navy gear alone, square; used by the sidebar's
//                  collapsed icon rail where there is no room for text.

interface WordmarkProps {
  className?: string;
  variant?: 'full' | 'mark';
}

export function StudyworksWordmark({ className, variant = 'full' }: WordmarkProps) {
  if (variant === 'mark') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="-70 -70 140 140"
        width={28}
        height={28}
        role="img"
        aria-label="Studyworks"
        className={className}
      >
        <g fill="#102a43">
          <g>
            <rect x="-8" y="-66" width="16" height="16" rx="2.5" />
            <rect x="-8" y="50" width="16" height="16" rx="2.5" />
            <rect x="-66" y="-8" width="16" height="16" rx="2.5" />
            <rect x="50" y="-8" width="16" height="16" rx="2.5" />
          </g>
          <g transform="rotate(45)">
            <rect x="-8" y="-66" width="16" height="16" rx="2.5" />
            <rect x="-8" y="50" width="16" height="16" rx="2.5" />
            <rect x="-66" y="-8" width="16" height="16" rx="2.5" />
            <rect x="50" y="-8" width="16" height="16" rx="2.5" />
          </g>
          <circle r="50" />
        </g>
        <circle r="16" fill="#ffffff" />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 729 174"
      width={117}
      height={28}
      role="img"
      aria-label="Studyworks"
      className={className}
    >
      <g transform="translate(68, 94)">
        <g fill="#102a43">
          <g>
            <rect x="-8" y="-66" width="16" height="16" rx="2.5" />
            <rect x="-8" y="50" width="16" height="16" rx="2.5" />
            <rect x="-66" y="-8" width="16" height="16" rx="2.5" />
            <rect x="50" y="-8" width="16" height="16" rx="2.5" />
          </g>
          <g transform="rotate(45)">
            <rect x="-8" y="-66" width="16" height="16" rx="2.5" />
            <rect x="-8" y="50" width="16" height="16" rx="2.5" />
            <rect x="-66" y="-8" width="16" height="16" rx="2.5" />
            <rect x="50" y="-8" width="16" height="16" rx="2.5" />
          </g>
          <circle r="50" />
        </g>
        <circle r="16" fill="#ffffff" />
      </g>
      <g transform="translate(124, 36) rotate(22)">
        <g fill="#bf8700">
          <g>
            <rect x="-5" y="-38" width="10" height="10" rx="1.8" />
            <rect x="-5" y="28" width="10" height="10" rx="1.8" />
            <rect x="-38" y="-5" width="10" height="10" rx="1.8" />
            <rect x="28" y="-5" width="10" height="10" rx="1.8" />
          </g>
          <g transform="rotate(45)">
            <rect x="-5" y="-38" width="10" height="10" rx="1.8" />
            <rect x="-5" y="28" width="10" height="10" rx="1.8" />
            <rect x="-38" y="-5" width="10" height="10" rx="1.8" />
            <rect x="28" y="-5" width="10" height="10" rx="1.8" />
          </g>
          <circle r="28" />
        </g>
        <circle r="9" fill="#ffffff" />
      </g>
      <text
        x="170"
        y="124"
        fontFamily="'Playfair Display', Georgia, serif"
        fontWeight="700"
        fontSize="86"
        letterSpacing="-1.3"
        fill="#102a43"
      >
        Study<tspan fill="#bf8700">works</tspan>
      </text>
    </svg>
  );
}
