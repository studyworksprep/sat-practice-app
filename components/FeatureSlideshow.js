'use client';

import { useCallback, useEffect, useState } from 'react';

// Marketing slideshow chrome. Used by /features/students,
// /features/teachers, /features/tutor-managers via slide arrays
// they pass into <FeatureSlideshow slides={...}/>. The slide-type
// helpers (SlideHero, SlideScreenshot, SlidePricing, etc.) export
// out of this file so the per-persona pages stay declarative.
//
// Visual language is the next-tree design system (navy + gold,
// Playfair display headlines on Inter body). The pages live in
// the legacy app/* tree but app/features/layout.js imports the
// next-tree tokens and wraps in data-tree="next" so the var(...)
// references below resolve to the same palette as /next.

const NAVY = 'var(--color-navy-900)';
const NAVY_HOVER = 'var(--color-navy-800)';
const GOLD = 'var(--color-gold-600)';
const FG1 = 'var(--fg1)';
const FG2 = 'var(--fg2)';
const FG3 = 'var(--fg3)';
const BORDER = 'var(--border)';
const BG_TINT = 'var(--bg-tint, #f4f6fa)';
const BG_PAPER = 'var(--bg-white, #ffffff)';

const FONT_SERIF = 'var(--font-serif)';
const FONT_SANS = 'var(--font-sans)';

const arrowBtnStyle = (enabled) => ({
  position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 20,
  width: 52, height: 76, borderRadius: 12,
  border: `1px solid ${BORDER}`,
  background: enabled ? '#ffffff' : 'rgba(255,255,255,0.5)',
  boxShadow: enabled ? 'var(--shadow-md)' : 'none',
  cursor: enabled ? 'pointer' : 'default',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: enabled ? NAVY : 'rgba(17,24,39,0.18)',
  transition: 'all var(--dur-fast) var(--ease-std)',
});

const panelStyle = {
  background: '#ffffff',
  border: `1px solid ${BORDER}`,
  borderRadius: 16,
  padding: '32px 36px',
  boxShadow: 'var(--shadow-md)',
  maxWidth: 780,
  margin: '0 auto',
  width: '100%',
  fontFamily: FONT_SANS,
};

const ctaButtonStyle = (variant = 'primary') => {
  if (variant === 'primary') {
    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '12px 28px',
      fontSize: 14,
      fontWeight: 700,
      letterSpacing: '0.01em',
      background: NAVY,
      color: '#ffffff',
      border: `1px solid ${NAVY}`,
      borderRadius: 8,
      textDecoration: 'none',
      cursor: 'pointer',
      transition: 'background var(--dur-fast) var(--ease-std), border-color var(--dur-fast) var(--ease-std)',
    };
  }
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 18px',
    fontSize: 13,
    fontWeight: 600,
    color: NAVY,
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    textDecoration: 'none',
    cursor: 'pointer',
  };
};

// Same wordmark used in app/next/HomeClient.jsx and
// lib/ui/AppNav.jsx — duplicated here so the marketing chrome
// loads as a static SVG (no shared component import / runtime
// resolution) and the brand reads identically across surfaces.
function Wordmark({ height = 28 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 729 174"
      height={height}
      width={(height * 729) / 174}
      role="img"
      aria-label="Studyworks"
    >
      <g transform="translate(68, 94)">
        <g fill="#102a43">
          <g>
            <rect x="-8" y="-66" width="16" height="16" rx="2.5" />
            <rect x="-8" y="50" width="16" height="16" rx="2.5" />
            <rect x="-66" y="-8" width="16" height="16" rx="2.5" />
            <rect x="50" y="-8" width="16" height="16" rx="2.5" />
          </g>
          <g transform="rotate(45)">
            <rect x="-8" y="-66" width="16" height="16" rx="2.5" />
            <rect x="-8" y="50" width="16" height="16" rx="2.5" />
            <rect x="-66" y="-8" width="16" height="16" rx="2.5" />
            <rect x="50" y="-8" width="16" height="16" rx="2.5" />
          </g>
          <circle r="50" />
        </g>
        <circle r="16" fill="#ffffff" />
      </g>
      <g transform="translate(124, 36) rotate(22)">
        <g fill="#bf8700">
          <g>
            <rect x="-5" y="-38" width="10" height="10" rx="1.8" />
            <rect x="-5" y="28" width="10" height="10" rx="1.8" />
            <rect x="-38" y="-5" width="10" height="10" rx="1.8" />
            <rect x="28" y="-5" width="10" height="10" rx="1.8" />
          </g>
          <g transform="rotate(45)">
            <rect x="-5" y="-38" width="10" height="10" rx="1.8" />
            <rect x="-5" y="28" width="10" height="10" rx="1.8" />
            <rect x="-38" y="-5" width="10" height="10" rx="1.8" />
            <rect x="28" y="-5" width="10" height="10" rx="1.8" />
          </g>
          <circle r="28" />
        </g>
        <circle r="9" fill="#ffffff" />
      </g>
      <text
        x="170"
        y="124"
        fontFamily="'Playfair Display', Georgia, serif"
        fontWeight="700"
        fontSize="86"
        letterSpacing="-1.3"
        fill="#102a43"
      >
        Study<tspan fill="#bf8700">works</tspan>
      </text>
    </svg>
  );
}

// SCREENSHOT_FRAME_HEIGHT — see comment on the frame below: every
// SlideScreenshot puts its image inside this fixed-height frame so
// consecutive slides don't jump in height when the underlying
// screenshots have wildly different aspect ratios.
const SCREENSHOT_FRAME_HEIGHT = 480;

export default function FeatureSlideshow({ slides }) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);
  const total = slides.length;

  const go = useCallback((idx) => {
    if (idx === current || idx < 0 || idx >= total) return;
    setDirection(idx > current ? 1 : -1);
    setCurrent(idx);
  }, [current, total]);

  const next = useCallback(() => { if (current < total - 1) go(current + 1); }, [current, total, go]);
  const prev = useCallback(() => { if (current > 0) go(current - 1); }, [current, go]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  useEffect(() => {
    let startX = 0;
    const onStart = (e) => { startX = e.touches?.[0]?.clientX ?? 0; };
    const onEnd = (e) => {
      const endX = e.changedTouches?.[0]?.clientX ?? 0;
      const diff = startX - endX;
      if (Math.abs(diff) > 50) { diff > 0 ? next() : prev(); }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchend', onEnd); };
  }, [next, prev]);

  const slide = slides[current];
  const canPrev = current > 0;
  const canNext = current < total - 1;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: FONT_SANS,
        color: FG1,
        background: `
          radial-gradient(circle at 10% -8%, var(--color-app-highlight-soft) 0, transparent 38%),
          radial-gradient(circle at 110% 0%, rgba(41, 182, 232, 0.10) 0, transparent 45%),
          var(--bg)`,
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 28px',
          borderBottom: `1px solid ${BORDER}`,
          background: 'rgba(255,255,255,0.92)',
          position: 'relative',
          zIndex: 20,
          backdropFilter: 'blur(10px)',
        }}
      >
        <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Wordmark height={28} />
        </a>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a
            href="/"
            style={{
              fontSize: 13,
              color: FG2,
              textDecoration: 'none',
              padding: '6px 12px',
              fontWeight: 500,
            }}
          >
            Home
          </a>
          <a
            href="/"
            style={{
              ...ctaButtonStyle('primary'),
              padding: '8px 18px',
              fontSize: 13,
            }}
          >
            Get Started
          </a>
        </div>
      </div>

      {/* Main area with side arrows anchored to card */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}>
        <div style={{ position: 'relative', maxWidth: 920, width: '100%', display: 'flex', alignItems: 'center' }}>
          <button
            onClick={prev}
            disabled={!canPrev}
            style={{ ...arrowBtnStyle(canPrev), position: 'relative', left: 0, top: 0, transform: 'none', flexShrink: 0, marginRight: 12 }}
            aria-label="Previous slide"
          >
            <svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
          </button>

          <div
            key={current}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: 0,
              width: '100%',
              animation: 'fsSlideIn 0.3s ease-out',
            }}
          >
            {typeof slide.content === 'function' ? slide.content({ next, prev, go }) : slide.content}
          </div>

          <button
            onClick={next}
            disabled={!canNext}
            style={{ ...arrowBtnStyle(canNext), position: 'relative', right: 0, top: 0, transform: 'none', flexShrink: 0, marginLeft: 12 }}
            aria-label="Next slide"
          >
            <svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
          </button>
        </div>
      </div>

      {/* Bottom nav */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 6,
          padding: '14px 20px',
          background: 'rgba(255,255,255,0.92)',
          borderTop: `1px solid ${BORDER}`,
          position: 'relative',
          zIndex: 20,
          backdropFilter: 'blur(10px)',
        }}
      >
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => go(i)}
            aria-label={`Slide ${i + 1}`}
            style={{
              width: i === current ? 28 : 8,
              height: 8,
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              background: i === current ? NAVY : 'var(--color-slate-300)',
              transition: 'all var(--dur-base) var(--ease-std)',
              padding: 0,
            }}
          />
        ))}
        <span style={{ fontSize: 12, color: FG3, marginLeft: 16, fontVariantNumeric: 'tabular-nums' }}>
          {current + 1} / {total}
        </span>
      </div>

      <style>{`
        @keyframes fsSlideIn {
          from { opacity: 0; transform: translateX(${direction >= 0 ? '40' : '-40'}px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

/* ─── Slide building blocks ─── */

// Eyebrow — small uppercase label used at the top of titled
// slides (Pricing, Team Pricing, etc.). Pulls the next-tree
// eyebrow tokens so the marketing tour matches the in-app eyebrow
// styling on dashboards and reports.
function Eyebrow({ children, color = GOLD }) {
  return (
    <div
      style={{
        fontSize: 'var(--eyebrow-size, 11px)',
        fontWeight: 'var(--eyebrow-weight, 700)',
        textTransform: 'uppercase',
        letterSpacing: 'var(--eyebrow-tracking, 0.08em)',
        color,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

const headlineStyle = {
  fontFamily: FONT_SERIF,
  fontWeight: 700,
  letterSpacing: '-0.015em',
  color: NAVY,
  lineHeight: 1.1,
};

export function SlideHero({ title, subtitle, ctaHref, ctaText, altHref, altText, onCtaClick, next }) {
  const handleCta = onCtaClick === 'next' && next ? (e) => { e.preventDefault(); next(); } : undefined;
  return (
    <div style={panelStyle}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ ...headlineStyle, fontSize: 40, margin: '0 0 18px' }}>{title}</h1>
        <p style={{ fontSize: 17, color: FG2, maxWidth: 540, margin: '0 auto', lineHeight: 1.6 }}>{subtitle}</p>
        {(ctaHref || ctaText || altHref) && (
          <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            {(ctaHref || handleCta) && (
              <a
                href={ctaHref || '#'}
                onClick={handleCta}
                style={{ ...ctaButtonStyle('primary'), padding: '14px 32px', fontSize: 15 }}
              >
                {ctaText}
                <svg viewBox="0 0 20 20" width="16" height="16"><path fill="currentColor" d="M7.3 14.7a1 1 0 010-1.4L10.6 10 7.3 6.7a1 1 0 011.4-1.4l4 4a1 1 0 010 1.4l-4 4a1 1 0 01-1.4 0z"/></svg>
              </a>
            )}
            {altHref && (
              <a
                href={altHref}
                style={{ padding: '12px 20px', fontSize: 14, color: NAVY, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                {altText}
                <svg viewBox="0 0 20 20" width="14" height="14"><path fill="currentColor" d="M7.3 14.7a1 1 0 010-1.4L10.6 10 7.3 6.7a1 1 0 011.4-1.4l4 4a1 1 0 010 1.4l-4 4a1 1 0 01-1.4 0z"/></svg>
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function SlideFeatures({ label, title, features, color }) {
  const accent = color || NAVY;
  return (
    <div style={panelStyle}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        {label && <Eyebrow color={accent}>{label}</Eyebrow>}
        <h2 style={{ ...headlineStyle, fontSize: 28, margin: 0 }}>{title}</h2>
      </div>
      <div style={{ display: 'grid', gap: 12, maxWidth: 680, margin: '0 auto' }}>
        {features.map((f, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 14,
              padding: '16px 20px',
              background: BG_TINT,
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'var(--color-app-primary-soft)',
                color: accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {f.icon}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3, color: FG1 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: FG2, lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SlideScreenshot({ src, alt, title, description }) {
  const [visible, setVisible] = useState(true);
  return (
    <div style={panelStyle}>
      <div style={{ display: 'grid', gap: 18 }}>
        <div>
          {title && <h2 style={{ ...headlineStyle, fontSize: 26, margin: '0 0 10px' }}>{title}</h2>}
          {description && <p style={{ fontSize: 15, color: FG2, margin: 0, lineHeight: 1.65 }}>{description}</p>}
        </div>
        {/* Image — fixed-height frame + object-fit: contain so wide
            and tall screenshots letterbox into the same visual box
            and the slideshow doesn't jump in height between slides. */}
        {visible && (
          <div
            style={{
              borderRadius: 12,
              overflow: 'hidden',
              border: `1px solid ${BORDER}`,
              boxShadow: 'var(--shadow-md)',
              background: 'linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)',
              padding: 2,
              height: SCREENSHOT_FRAME_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={src}
              alt={alt}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                display: 'block',
                borderRadius: 10,
                objectFit: 'contain',
              }}
              onError={() => setVisible(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function SlidePricing({ price, period, items, ctaHref, ctaText, note }) {
  return (
    <div style={panelStyle}>
      <div style={{ textAlign: 'center' }}>
        <Eyebrow>Pricing</Eyebrow>
        <h2 style={{ ...headlineStyle, fontSize: 28, margin: '0 0 22px' }}>One plan. Full access.</h2>
        <div
          style={{
            display: 'inline-block',
            padding: '32px 40px',
            border: `1px solid ${BORDER}`,
            borderRadius: 16,
            background: BG_PAPER,
            boxShadow: 'var(--shadow-sm)',
            minWidth: 320,
          }}
        >
          <div style={{ fontSize: 56, fontWeight: 800, color: NAVY, lineHeight: 1, fontFamily: FONT_SERIF }}>{price}</div>
          <div style={{ fontSize: 13, color: FG3, marginTop: 6, letterSpacing: '0.01em' }}>{period}</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 22px', textAlign: 'left', display: 'grid', gap: 6 }}>
            {items.map((item, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, color: FG1 }}>
                <CheckIcon />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <a
            href={ctaHref || '/'}
            style={{
              ...ctaButtonStyle('primary'),
              width: '100%',
              justifyContent: 'center',
              padding: '12px 24px',
              fontSize: 14,
            }}
          >
            {ctaText || 'Get Started'}
          </a>
        </div>
        {note && <PricingNote note={note} />}
      </div>
    </div>
  );
}

// Tiered version — used by decks where the per-seat price varies
// with team size. Three tier cards in a 3-column grid (the middle
// one is highlighted), shared feature bullet list underneath, and
// an optional note block (e.g. enterprise contact callout).
//
// Each tier in the `tiers` array is:
//   { name, range, price, period, savings?, highlight? }
// `highlight: true` draws the navy border + "Most popular" ribbon.
export function SlideTieredPricing({
  title = 'Team pricing',
  subtitle,
  tiers,
  items,
  ctaHref,
  ctaText,
  note,
}) {
  return (
    <div style={{ ...panelStyle, maxWidth: 900, padding: '28px 32px' }}>
      <div style={{ textAlign: 'center' }}>
        <Eyebrow>Pricing</Eyebrow>
        <h2 style={{ ...headlineStyle, fontSize: 26, margin: '0 0 6px' }}>{title}</h2>
        {subtitle && (
          <p style={{ fontSize: 14, color: FG2, margin: '0 auto', maxWidth: 580, lineHeight: 1.5 }}>{subtitle}</p>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${tiers.length}, minmax(0, 1fr))`,
            gap: 14,
            margin: '22px 0 8px',
          }}
        >
          {tiers.map((tier, i) => (
            <div
              key={i}
              style={{
                position: 'relative',
                padding: '22px 14px 18px',
                border: tier.highlight ? `2px solid ${NAVY}` : `1px solid ${BORDER}`,
                borderRadius: 14,
                background: tier.highlight ? 'var(--color-app-primary-soft)' : BG_TINT,
                textAlign: 'center',
              }}
            >
              {tier.highlight && (
                <div
                  style={{
                    position: 'absolute',
                    top: -10,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: NAVY,
                    color: '#ffffff',
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    padding: '3px 10px',
                    borderRadius: 999,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Most popular
                </div>
              )}
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: NAVY }}>
                {tier.name}
              </div>
              <div style={{ fontSize: 11, color: FG3, marginTop: 3, minHeight: 16 }}>{tier.range}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: NAVY, marginTop: 12, lineHeight: 1, fontFamily: FONT_SERIF }}>
                {tier.price}
              </div>
              <div style={{ fontSize: 11, color: FG3, marginTop: 4 }}>{tier.period}</div>
              <div style={{ fontSize: 11, color: 'var(--color-success)', fontWeight: 700, marginTop: 8, minHeight: 14 }}>
                {tier.savings || ' '}
              </div>
            </div>
          ))}
        </div>

        {items && items.length > 0 && (
          <>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: FG3,
                margin: '20px 0 12px',
              }}
            >
              Every tier includes
            </div>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: '0 auto',
                maxWidth: 620,
                textAlign: 'left',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '6px 20px',
              }}
            >
              {items.map((item, i) => (
                <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: FG1 }}>
                  <CheckIcon />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <a
          href={ctaHref || '/'}
          style={{
            ...ctaButtonStyle('primary'),
            padding: '12px 32px',
            fontSize: 14,
            marginTop: 20,
          }}
        >
          {ctaText || 'Get Started'}
        </a>

        {note && <PricingNote note={note} />}
      </div>
    </div>
  );
}

export function SlideContact({ title, subtitle, email, subject, buttonText }) {
  return (
    <div style={panelStyle}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ ...headlineStyle, fontSize: 28, margin: '0 0 14px' }}>{title}</h2>
        <p style={{ fontSize: 15, color: FG2, maxWidth: 460, margin: '0 auto 24px', lineHeight: 1.6 }}>{subtitle}</p>
        <a
          href={`mailto:${email}?subject=${encodeURIComponent(subject || '')}`}
          style={ctaButtonStyle('secondary')}
        >
          {buttonText || 'Contact us'}
        </a>
      </div>
    </div>
  );
}

// Comprehensive feature rundown — the second-to-last slide in
// each deck. Designed to hold 15-25 items without looking like a
// wall of text by grouping into labeled sections and using a
// 2-column grid with checkmark bullets.
//
// Props:
//   title    — big headline at the top
//   subtitle — optional one-liner under the title
//   sections — array of { label, items } where each item is
//              { title, desc? }. desc is optional; without it the
//              row collapses to just the title.
export function SlideFeatureRundown({ title, subtitle, sections }) {
  return (
    <div style={{ ...panelStyle, maxWidth: 940, padding: '28px 32px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h2 style={{ ...headlineStyle, fontSize: 26, margin: '0 0 6px' }}>{title}</h2>
        {subtitle && (
          <p style={{ fontSize: 14, color: FG2, margin: '0 auto', maxWidth: 580, lineHeight: 1.5 }}>
            {subtitle}
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gap: 18 }}>
        {sections.map((section, si) => (
          <div key={si}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: GOLD,
                marginBottom: 10,
                paddingBottom: 6,
                borderBottom: `1px solid ${BORDER}`,
              }}
            >
              {section.label}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '6px 18px',
              }}
            >
              {section.items.map((item, ii) => (
                <div
                  key={ii}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    padding: '4px 0',
                  }}
                >
                  <CheckIcon style={{ marginTop: 2 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: FG1, lineHeight: 1.4 }}>
                      {item.title}
                    </div>
                    {item.desc && (
                      <div style={{ fontSize: 12, color: FG2, lineHeight: 1.45, marginTop: 2 }}>
                        {item.desc}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PricingNote({ note }) {
  return (
    <div
      style={{
        marginTop: 20,
        padding: '14px 22px',
        background: note.bg || 'var(--color-app-highlight-soft)',
        border: `1px solid ${note.border || 'rgba(240, 180, 41, 0.35)'}`,
        borderRadius: 12,
        maxWidth: 460,
        margin: '20px auto 0',
        textAlign: 'left',
      }}
    >
      <p style={{ fontSize: 13, fontWeight: 700, color: note.titleColor || 'var(--color-gold-700)', margin: '0 0 4px' }}>
        {note.title}
      </p>
      <p style={{ fontSize: 13, color: note.textColor || FG2, margin: 0, lineHeight: 1.55 }}>
        {note.text}
      </p>
    </div>
  );
}

function CheckIcon({ style }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      style={{ flexShrink: 0, color: 'var(--color-success)', ...style }}
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
      />
    </svg>
  );
}
