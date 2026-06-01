import './globals.css';
import { headers } from 'next/headers';
import { Inter, Playfair_Display } from 'next/font/google';
import NavBar from '../components/NavBar';
import StorageHygiene from '../components/StorageHygiene';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { TestTypeProvider } from '../lib/TestTypeContext';
import { desmosCalculatorSrc } from '../lib/config/desmos';

// Self-hosted Google Fonts via next/font. The bundler downloads
// them at build time, scopes the @font-face to a hashed class on
// <html>, and exposes a CSS custom property each. The token file
// (app/styles/next-tokens.css) reads --font-inter / --font-playfair
// at the head of its --font-sans / --font-serif fallback stacks,
// so every macOS / Windows / Linux user sees the same typeface
// instead of falling through to system fonts.
//
// Weights chosen to match what next-tree CSS actually uses:
//   - Inter 400/500/600/700/800 (the design kit's set)
//   - Playfair Display 600/700/800 (serif headings)
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
  title: 'SAT Practice',
  description: 'Practice SAT questions with Supabase + Next.js',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({ children }) {
  // proxy.js sets x-ui-tree on every request based on the
  // resolved tree (kill switch + per-user JWT flag combined).
  // We pass it down so NavBar has an authoritative signal —
  // re-deriving from the JWT in the client missed the kill
  // switch and produced a "no nav at all" page when the two
  // disagreed.
  const h = await headers();
  const uiTree = h.get('x-ui-tree') === 'next' ? 'next' : 'legacy';

  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <head>
        {/* Speed up Desmos loading: early DNS + TLS handshake, then preload the script */}
        <link rel="dns-prefetch" href="https://www.desmos.com" />
        <link rel="preconnect" href="https://www.desmos.com" />
        {/* No crossOrigin here — `next/script` below renders a plain
            <script> tag (no `crossorigin` attribute), which the browser
            treats as a no-CORS request. A `crossOrigin="anonymous"` on
            this preload would mismatch that, so the preload would be
            ignored and the script would re-fetch from scratch — adding
            latency and, on flaky networks, tripping ERR_TIMED_OUT. */}
        <link rel="preload" href={desmosCalculatorSrc()} as="script" />

        {/* MathJax config: enable both MathML and TeX input so
            content authored either way renders. TeX uses the
            standard \( \) inline + \[ \] / $$ display delimiters,
            matching the Bluebook-source content. CHTML output
            keeps native browser layout/font matching. */}
        <Script id="mathjax-config" strategy="beforeInteractive">
          {`
            window.MathJax = {
              loader: { load: ['input/mml', 'input/tex', 'output/chtml'] },
              tex: {
                inlineMath: [['\\\\(', '\\\\)']],
                displayMath: [['\\\\[', '\\\\]'], ['$$', '$$']],
                processEscapes: true
              },
              options: {
                skipHtmlTags: ['script','noscript','style','textarea','pre','code']
              },
              chtml: {
                scale: 1.0
              }
            };
          `}
        </Script>

        {/* MathJax v3 */}
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
        <TestTypeProvider>
          {/* Mounts before NavBar so the practice_session_* LRU
              cleanup runs before any of the legacy quota-prone
              setItem paths can fire on the next page load. */}
          <StorageHygiene />
          <NavBar uiTree={uiTree} />
          {children}
        </TestTypeProvider>
        {/* Vercel Analytics — tracks page views across both the legacy
            tree and app/next/*. Used for the browser-support audit
            (Phase 1.5 item 13) and for long-term traffic observability. */}
        <Analytics />
      </body>
    </html>
  );
}
