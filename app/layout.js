import './globals.css';
import './styles/next-tokens.css';
import './styles/next-prose.css';
import './styles/next-tools.css';
import { Inter, Playfair_Display } from 'next/font/google';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { desmosCalculatorSrc } from '../lib/config/desmos';

// Self-hosted Google Fonts via next/font. The bundler downloads them
// at build time, scopes the @font-face to a hashed class on <html>,
// and exposes a CSS custom property each. The token file
// (app/styles/next-tokens.css) reads --font-inter / --font-playfair
// at the head of its --font-sans / --font-serif fallback stacks, so
// every macOS / Windows / Linux user sees the same typeface instead
// of falling through to system fonts.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-playfair',
  display: 'swap',
});

export const metadata = {
  title: 'Studyworks',
  description: 'Practice SAT questions with Supabase + Next.js',
};

// No maximumScale cap (§6.3): pinch-zoom is an accessibility
// baseline — iOS ignores the cap anyway and Android honoring it
// just locked zoom out for the users who need it most.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <head>
        {/* Speed up Desmos loading: early DNS + TLS handshake, then preload the script */}
        <link rel="dns-prefetch" href="https://www.desmos.com" />
        <link rel="preconnect" href="https://www.desmos.com" />
        {/* No crossOrigin here — next/script below renders a plain <script>
            (no `crossorigin` attribute), which the browser treats as a no-CORS
            request. A `crossOrigin="anonymous"` on this preload would mismatch
            that, so the preload would be ignored and the script would re-fetch
            from scratch — adding latency and, on flaky networks, ERR_TIMED_OUT. */}
        <link rel="preload" href={desmosCalculatorSrc()} as="script" />

        {/* MathJax config: enable both MathML and TeX input so content
            authored either way renders. TeX uses the standard \( \) inline +
            \[ \] / $$ display delimiters, matching Bluebook-source content.

            chtml.matchFontHeight is deliberately OFF, with the scale it
            would otherwise compute pinned as a constant. Left on, MathJax
            sizes every expression by measuring a hidden 60ex probe's
            offsetHeight and dividing by the container's computed
            font-size — a measurement that is wrong in two ways here:

              - WebKit inflates offsetHeight under an effective zoom but
                leaves the computed font-size alone, so any Safari user
                with the site page-zoomed got math scaled by the zoom on
                top of the zoom. At 115% inline math rendered 1.42x the
                text height instead of 1.25x; at 150%, 1.84x, and the
                line boxes containing math grew 17% taller than their
                neighbours. Chrome scales neither value, so it only ever
                showed in Safari.
              - It runs once, whenever that expression is typeset. Inter
                loads with display: swap, so an expression typeset during
                the swap window matched the fallback face (1.1911) and
                one typeset after matched Inter (1.2355) — a ~4% wobble
                between page loads, in every browser.

            1.2355 is the value the measurement itself produces against
            Inter once loaded (ex/em 0.5461 ÷ the TeX font's 0.442
            x-height), so this pins the intended appearance rather than
            changing it — it just stops re-deriving it from a probe that
            zoom and font-loading both perturb. Re-measure it if
            --font-sans ever stops being Inter. */}
        <Script id="mathjax-config" strategy="beforeInteractive">
          {`
            window.MathJax = {
              loader: { load: ['input/mml', 'input/tex', 'output/chtml'] },
              tex: {
                inlineMath: [['\\\\(', '\\\\)']],
                displayMath: [['\\\\[', '\\\\]'], ['$$', '$$']],
                processEscapes: true
              },
              chtml: {
                matchFontHeight: false,
                scale: 1.2355
              }
            };
          `}
        </Script>
        <Script
          id="mathjax-script"
          strategy="beforeInteractive"
          src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"
        />
        <Script
          id="desmos-calculator-script"
          strategy="afterInteractive"
          src={desmosCalculatorSrc()}
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
