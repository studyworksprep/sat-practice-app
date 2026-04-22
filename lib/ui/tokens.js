// Studyworks design-system tokens, distilled from
// `studyworks-design-system/project/colors_and_type.css` and the
// sat-practice-app ui_kit. Values are JS constants so new-tree
// components can use them via inline styles without touching
// app/globals.css (which is shared with the legacy tree).
//
// Keep this file token-only — no component styles. Each component
// composes tokens into its own style object.

export const colors = {
  // Brand
  brand: {
    cyan:     '#29B6E8',
    cyanDark: '#1D8FBF',
    cyanSoft: '#DFF3FB',
  },

  navy: {
    50:  '#f0f4f8', 100: '#d9e2ec', 200: '#bcccdc', 300: '#9fb3c8',
    400: '#829ab1', 500: '#627d98', 600: '#486581', 700: '#334e68',
    800: '#243b53', 900: '#102a43', 950: '#0a1929',
  },
  gold: {
    50:  '#fffbea', 100: '#fff3c4', 200: '#fce588', 300: '#fadb5f',
    400: '#f7c948', 500: '#f0b429', 600: '#de911d', 700: '#cb6e17',
    800: '#b44d12', 900: '#8d2b0b',
  },
  slate: {
    50:  '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1',
    400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155',
    800: '#1e293b', 900: '#0f172a',
  },

  // App-primary is unified to navy — matches the marketing surface.
  accent:      '#102a43',
  accentHover: '#243b53',
  accentSoft:  'rgba(16, 42, 67, 0.06)',
  accentRing:  'rgba(16, 42, 67, 0.12)',

  // App highlight (gold) — streaks, active nav link, CTA moments.
  highlight:      '#f0b429',
  highlightHover: '#f7c948',
  highlightSoft:  'rgba(240, 180, 41, 0.12)',

  // Semantic (muted, softer than default reds/greens on purpose).
  success: '#5ba876',
  danger:  '#d97775',
  amber:   '#c2993e',

  // Difficulty tints (pale backgrounds on question map).
  difficulty: {
    easy:    { bg: '#dcfce7', bd: '#86efac', fg: '#166534' },
    med:     { bg: '#fef9c3', bd: '#fde047', fg: '#854d0e' },
    hard:    { bg: '#fee2e2', bd: '#fca5a5', fg: '#991b1b' },
    vhard:   { bg: '#fce7f3', bd: '#f9a8d4', fg: '#9d174d' },
    extreme: { bg: '#ede9fe', bd: '#c4b5fd', fg: '#5b21b6' },
  },

  // Surfaces.
  bg:          '#f9fafb',
  bgWhite:     '#ffffff',
  card:        '#ffffff',
  fg1:         '#111827',
  fg2:         '#475569',
  fg3:         '#6b7280',
  border:      'rgba(17, 24, 39, 0.08)',
  borderStrong:'rgba(17, 24, 39, 0.18)',
};

export const fonts = {
  serif: '"Playfair Display", ui-serif, Georgia, Cambria, "Times New Roman", serif',
  sans:  '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono:  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
};

// 4-based spacing scale.
export const space = {
  1: '4px', 2: '8px', 3: '12px', 4: '16px',
  5: '24px', 6: '32px', 7: '48px', 8: '64px', 9: '96px',
};

export const radius = {
  none: 0, sm: 6, md: 8, lg: 12, xl: 16, xxl: 24, pill: 999,
};

export const shadow = {
  none: 'none',
  sm:   '0 1px 3px rgba(0,0,0,0.04)',
  md:   '0 4px 14px rgba(16,42,67,0.08)',
  lg:   '0 8px 30px rgba(16,42,67,0.12)',
  ringAccent: `0 0 0 3px ${colors.accentSoft}`,
};

export const motion = {
  easeStd:  'cubic-bezier(0.4, 0, 0.2, 1)',
  easeOut:  'cubic-bezier(0.0, 0, 0.2, 1)',
  durFast:  '120ms',
  durBase:  '180ms',
  durSlow:  '300ms',
};

// Reusable pre-composed pieces.
export const card = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.lg,
  boxShadow: shadow.sm,
};

// App-scale heads.
export const type = {
  h1: {
    fontFamily: fonts.sans, fontSize: 28, lineHeight: 1.2,
    fontWeight: 750, letterSpacing: '-0.01em', color: colors.fg1, margin: 0,
  },
  h2: {
    fontFamily: fonts.sans, fontSize: 18, lineHeight: 1.25,
    fontWeight: 700, letterSpacing: '-0.005em', color: colors.fg1, margin: 0,
  },
  h3: {
    fontFamily: fonts.sans, fontSize: 14, lineHeight: 1.3,
    fontWeight: 700, color: colors.fg1, margin: 0,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: colors.fg3, margin: 0,
  },
  body: {
    fontFamily: fonts.sans, fontSize: 15, lineHeight: 1.65, color: colors.slate[700],
  },
  prose: {
    fontSize: 15, lineHeight: 1.65, color: colors.slate[700],
  },
  mono: {
    fontFamily: fonts.mono, fontSize: 13,
  },
};
