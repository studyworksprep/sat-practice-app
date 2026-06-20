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

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
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
            CHTML output keeps native browser layout/font matching. */}
        <Script id="mathjax-config" strategy="beforeInteractive">
          {`
            window.MathJax = {
              loader: { load: ['input/mml', 'input/tex', 'output/chtml'] },
              tex: {
                inlineMath: [['\\\\(', '\\\\)']],
                displayMath: [['\\\\[', '\\\\]'], ['$$', '$$']],
                processEscapes: true
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
        {/* The data-tree="next" wrapper is the last surviving piece of the
            parallel-build scoping. C-4 of the decommission flips next-tokens.css
            from [data-tree="next"] to :root and removes this div. */}
        <div data-tree="next">{children}</div>
        <Analytics />
      </body>
    </html>
  );
}
