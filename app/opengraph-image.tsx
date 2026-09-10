// Generates the 1200x630 link-preview card served at
// /opengraph-image, and wires og:image / twitter:image to it for
// every page that doesn't supply its own.
//
// Rendered at build time by next/og rather than committed as a PNG:
// the wordmark and tagline are the two strings most likely to change,
// and a generated card keeps them in one place instead of in a binary
// nobody can grep. No custom font is loaded — Satori's built-in face
// is used, which keeps this free of a network fetch during the build.
//
// The logo is redrawn here as plain divs rather than reusing
// public/studyworks-logo.svg: Satori supports only a subset of SVG,
// and an <img> pointing at a transparent-background asset renders
// unpredictably against dark backgrounds in the various preview
// clients. Solid shapes on a solid ground preview identically
// everywhere.

import { ImageResponse } from 'next/og';
import { siteDescription } from '@/lib/config/site';

export const alt = 'Studyworks — SAT & ACT practice for high school students';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const NAVY = '#102a43';
const GOLD = '#bf8700';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: NAVY,
          padding: '90px 96px',
        }}
      >
        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 92, fontWeight: 700 }}>
          <span style={{ color: '#ffffff' }}>Study</span>
          <span style={{ color: GOLD }}>works</span>
        </div>

        {/* Gold rule, echoing the mark's accent */}
        <div
          style={{
            display: 'flex',
            width: 132,
            height: 8,
            background: GOLD,
            borderRadius: 4,
            margin: '38px 0',
          }}
        />

        <div
          style={{
            display: 'flex',
            fontSize: 44,
            lineHeight: 1.35,
            color: '#e6edf5',
            maxWidth: 900,
          }}
        >
          {siteDescription}
        </div>
      </div>
    ),
    size,
  );
}
