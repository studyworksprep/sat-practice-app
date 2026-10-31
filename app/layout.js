import './globals.css';
import './styles/next-tokens.css';
import './styles/next-prose.css';
import './styles/next-tools.css';
import { Inter, Playfair_Display } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { siteUrl, siteName, siteTitle, siteDescription } from '../lib/config/site';

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
