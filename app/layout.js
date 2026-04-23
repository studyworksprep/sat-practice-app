import './globals.css';
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

export default function RootLayout({ children }) {
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

        {/* MathJax config: enable MathML input + CHTML output */}
        <Script id="mathjax-config" strategy="beforeInteractive">
          {`
            window.MathJax = {
              loader: { load: ['input/mml', 'output/chtml'] },
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
          <NavBar />
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
