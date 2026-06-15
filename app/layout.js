import './globals.css';
import { Inter, Playfair_Display } from 'next/font/google';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';

// Self-hosted Google Fonts via next/font. The bundler downloads
// them at build time, scopes the @font-face to a hashed class on
// <html>, and exposes a CSS custom property each. The token file
// (app/styles/next-tokens.css) reads --font-inter / --font-playfair
// at the head of its --font-sans / --font-serif fallback stacks.
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

// Every page reads per-request auth state (cookies, JWT, RLS-scoped
// Supabase queries). Static prerendering would either fail at build
// time or serve stale shells. Force dynamic rendering at the root
// so individual pages don't each have to opt out.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }) {
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
            ignored and the script would re-fetch from scratch. */}
        <link
          rel="preload"
          href={`https://www.desmos.com/api/v1.11/calculator.js?apiKey=${process.env.NEXT_PUBLIC_DESMOS_API_KEY || 'bac289385bcd4778a682276b95f5f116'}`}
          as="script"
        />

        {/* MathJax config: enable both MathML and TeX input so
            content authored either way renders. */}
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
        {children}
        {/* Vercel Analytics — long-term traffic observability. */}
        <Analytics />
      </body>
    </html>
  );
}
