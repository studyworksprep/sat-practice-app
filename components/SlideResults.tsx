'use client';

// Results slide for the persona feature decks. Shows the headline
// SAT results figures (lib/marketing/results.ts) as a row of stat
// tiles, a few supporting points, the source note, and a link to
// the full Results page on www.studyworksprep.com.
//
// Lives beside FeatureSlideshow.js (and borrows its panel styles)
// rather than inside it, so the slide types stay in one visual
// language without growing that file further.

import type { ReactNode } from 'react';
import { Eyebrow, headlineStyle, panelStyle } from '@/components/FeatureSlideshow';
import {
  headlineResultsStats,
  resultsPageUrl,
  resultsSourceNote,
  type ResultsStat,
} from '@/lib/marketing/results';

type SlideResultsProps = {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  stats?: ResultsStat[];
  points?: ReactNode[];
};

export function SlideResults({
  eyebrow = 'Studyworks results',
  title,
  subtitle,
  stats = headlineResultsStats,
  points = [],
}: SlideResultsProps) {
  return (
    <div style={panelStyle}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 style={{ ...headlineStyle, fontSize: 28, margin: '0 0 10px' }}>{title}</h2>
        {subtitle && (
          <p style={{ fontSize: 15, color: 'var(--fg2)', margin: '0 auto', maxWidth: 580, lineHeight: 1.6 }}>
            {subtitle}
          </p>
        )}
      </div>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          margin: 0,
        }}
      >
        {stats.map(({ value, label }) => (
          <div
            key={label}
            style={{
              display: 'flex',
              // dt-before-dd for screen readers, value-on-top visually;
              // flex-end (= top in column-reverse) keeps the values
              // aligned when label lengths differ.
              flexDirection: 'column-reverse',
              justifyContent: 'flex-end',
              gap: 4,
              padding: '18px 16px',
              background: 'var(--bg-tint, #f4f6fa)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              textAlign: 'center',
            }}
          >
            <dt style={{ fontSize: 13, color: 'var(--fg2)', lineHeight: 1.4 }}>{label}</dt>
            <dd
              style={{
                margin: 0,
                fontFamily: 'var(--font-serif)',
                fontSize: 34,
                fontWeight: 700,
                lineHeight: 1.1,
                color: 'var(--color-navy-900)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {points.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '22px auto 0', maxWidth: 620, display: 'grid', gap: 10 }}>
          {points.map((point, i) => (
            <li key={i} style={{ display: 'flex', gap: 10, fontSize: 14, color: 'var(--fg1)', lineHeight: 1.55 }}>
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: 6,
                  height: 6,
                  marginTop: 8,
                  borderRadius: 999,
                  background: 'var(--color-gold-600)',
                }}
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}

      <div
        style={{
          marginTop: 22,
          paddingTop: 16,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px 20px',
        }}
      >
        <p style={{ fontSize: 12, color: 'var(--fg3)', margin: 0, lineHeight: 1.5, maxWidth: 460 }}>
          {resultsSourceNote}
        </p>
        <a
          href={resultsPageUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-navy-900)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          See the full results
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
            <path fill="currentColor" d="M7.3 14.7a1 1 0 010-1.4L10.6 10 7.3 6.7a1 1 0 011.4-1.4l4 4a1 1 0 010 1.4l-4 4a1 1 0 01-1.4 0z" />
          </svg>
        </a>
      </div>
    </div>
  );
}
