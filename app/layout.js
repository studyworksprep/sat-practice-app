import './globals.css';
import { headers } from 'next/headers';
import NavBar from '../components/NavBar';
import StorageHygiene from '../components/StorageHygiene';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { TestTypeProvider } from '../lib/TestTypeContext';

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
    <html lang="en">
      <head>
        {/* Speed up Desmos loading: early DNS + TLS handshake, then preload the script */}
        <link rel="dns-prefetch" href="https://www.desmos.com" />
        <link rel="preconnect" href="https://www.desmos.com" crossOrigin="anonymous" />
        <link
          rel="preload"
          href={`https://www.desmos.com/api/v1.11/calculator.js?apiKey=${process.env.NEXT_PUBLIC_DESMOS_API_KEY || 'bac289385bcd4778a682276b95f5f116'}`}
          as="script"
          crossOrigin="anonymous"
        />

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
          src={`https://www.desmos.com/api/v1.11/calculator.js?apiKey=${process.env.NEXT_PUBLIC_DESMOS_API_KEY || 'bac289385bcd4778a682276b95f5f116'}`}
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
