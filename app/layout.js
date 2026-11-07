import './globals.css';
import './styles/next-tokens.css';
import './styles/next-prose.css';
import './styles/next-tools.css';
import localFont from 'next/font/local';
import { Analytics } from '@vercel/analytics/next';
import { siteUrl, siteName, siteTitle, siteDescription } from '../lib/config/site';

// Self-hosted fonts via next/font/local: the latin subsets of the
// Inter and Playfair Display variable fonts, committed in app/fonts/
// (SIL Open Font License; texts alongside). next/font scopes the
// @font-face to a hashed class on <html> and exposes a CSS custom
// property each. The token file (app/styles/next-tokens.css) reads
// --font-inter / --font-playfair at the head of its --font-sans /
// --font-serif fallback stacks, so every macOS / Windows / Linux user
// sees the same typeface instead of falling through to system fonts.
//
// Not next/font/google: that fetches from Google at build time, and
// Google sometimes answers with extensionless /l/font?kit= URLs that
// Next 16.2's Turbopack loader rejects ("next/font/google queries have
// exactly one entry"), failing the Vercel build at random
// (vercel/next.js#99114, fixed in 16.4.3). Local files also mean the
// build never depends on a third party being up.
const inter = localFont({
  src: './fonts/inter-latin-variable.woff2',
  weight: '400 800',
  style: 'normal',
  variable: '--font-inter',
  display: 'swap',
});

const playfair = localFont({
  src: './fonts/playfair-display-latin-variable.woff2',
  weight: '600 800',
  style: 'normal',
  variable: '--font-playfair',
  display: 'swap',
});

// Site-wide metadata defaults. Every public page overrides title,
// description, canonical and og:url with its own values (via
// publicPageMetadata); what lives here is the fallback any page
// inherits when it says nothing — which, for the signed-in surface,
// is most of them.
//
// Deliberately NOT set here:
//   - title.template. Existing pages already suffix their own titles
//     ('Help — Studyworks', 'Reset your password — Studyworks'), so a
//     template would render 'Help — Studyworks — Studyworks'.
//   - alternates.canonical / openGraph.url. A layout-level value is
//     inherited verbatim by every descendant, which would declare
//     that /subscribe and /features/teachers are both the homepage.
//     Canonical is per-route by nature; see lib/config/site.ts.
//
// metadataBase is what lets the relative og:image emitted by
// app/opengraph-image.tsx resolve to an absolute URL — link previews
// (Slack, iMessage, Teams) reject relative image URLs outright.
export const metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  applicationName: siteName,
  // Read by content classifiers and app stores; cheap, and the whole
  // point of this pass is that a filter can tell what this site is.
  category: 'education',
  openGraph: {
    type: 'website',
    siteName,
    locale: 'en_US',
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
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
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
