'use client';

import { useCallback, useEffect, useState } from 'react';

const ACCENT = 'var(--accent, #4f7ce0)';

/**
 * Full-screen slideshow component for feature pages.
 * Each slide is a full-viewport section with content and optional screenshot.
 */
export default function FeatureSlideshow({ slides, footer }) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0); // -1 = left, 1 = right, 0 = initial
  const total = slides.length;

  const go = useCallback((idx) => {
    if (idx === current || idx < 0 || idx >= total) return;
    setDirection(idx > current ? 1 : -1);
    setCurrent(idx);
  }, [current, total]);

  const next = useCallback(() => { if (current < total - 1) go(current + 1); }, [current, total, go]);
  const prev = useCallback(() => { if (current > 0) go(current - 1); }, [current, go]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  // Swipe support
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--card)', position: 'relative', zIndex: 10 }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <img src="/studyworks-logo.png" alt="StudyWorks" style={{ height: 28 }} />
        </a>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {slide.showCta && (
            <a href="/" className="btn primary" style={{ padding: '6px 20px', fontSize: 13, borderRadius: 8 }}>Get Started</a>
          )}
          <a href="/" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none', padding: '6px 12px' }}>Home</a>
        </div>
      </div>

      {/* Slide content */}
      <div
        key={current}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '32px 20px', maxWidth: 860, margin: '0 auto', width: '100%',
          animation: 'slideIn 0.3s ease-out',
        }}
      >
        {slide.content}
      </div>

      {/* Navigation */}
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16,
        padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'var(--card)',
        position: 'relative', zIndex: 10,
      }}>
        {/* Prev arrow */}
        <button
          onClick={prev}
          disabled={current === 0}
          style={{
            width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--border)',
            background: current === 0 ? 'transparent' : 'var(--surface)',
            cursor: current === 0 ? 'default' : 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            opacity: current === 0 ? 0.3 : 1, transition: 'opacity 0.15s',
          }}
          aria-label="Previous"
        >
          <svg viewBox="0 0 20 20" width="16" height="16"><path fill="currentColor" d="M12.7 5.3a1 1 0 010 1.4L9.4 10l3.3 3.3a1 1 0 01-1.4 1.4l-4-4a1 1 0 010-1.4l4-4a1 1 0 011.4 0z"/></svg>
        </button>

        {/* Dots */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {slides.map((s, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`Slide ${i + 1}`}
              style={{
                width: i === current ? 24 : 8, height: 8,
                borderRadius: 4, border: 'none', cursor: 'pointer',
                background: i === current ? ACCENT : 'var(--border)',
                transition: 'all 0.2s',
              }}
            />
          ))}
        </div>

        {/* Next arrow */}
        <button
          onClick={next}
          disabled={current === total - 1}
          style={{
            width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--border)',
            background: current === total - 1 ? 'transparent' : 'var(--surface)',
            cursor: current === total - 1 ? 'default' : 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            opacity: current === total - 1 ? 0.3 : 1, transition: 'opacity 0.15s',
          }}
          aria-label="Next"
        >
          <svg viewBox="0 0 20 20" width="16" height="16"><path fill="currentColor" d="M7.3 14.7a1 1 0 010-1.4L10.6 10 7.3 6.7a1 1 0 011.4-1.4l4 4a1 1 0 010 1.4l-4 4a1 1 0 01-1.4 0z"/></svg>
        </button>

        {/* Slide counter */}
        <span style={{ fontSize: 12, color: 'var(--muted)', position: 'absolute', right: 20 }}>
          {current + 1} / {total}
        </span>
      </div>

      {/* CSS animation */}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(${direction >= 0 ? '30' : '-30'}px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

/* ─── Shared slide building blocks ─── */

export function SlideHero({ title, subtitle, ctaHref, ctaText, altHref, altText }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <h1 style={{ fontSize: 40, fontWeight: 800, margin: '0 0 16px', color: 'var(--text)', lineHeight: 1.15 }}>
        {title}
      </h1>
      <p style={{ fontSize: 18, color: 'var(--muted)', maxWidth: 540, margin: '0 auto', lineHeight: 1.6 }}>
        {subtitle}
      </p>
      {(ctaHref || altHref) && (
        <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center', gap: 12 }}>
          {ctaHref && <a href={ctaHref} className="btn primary" style={{ padding: '12px 36px', fontSize: 16, borderRadius: 10 }}>{ctaText}</a>}
          {altHref && (
            <a href={altHref} style={{ padding: '12px 24px', fontSize: 14, color: ACCENT, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              {altText}
              <svg viewBox="0 0 20 20" width="16" height="16"><path fill="currentColor" d="M7.3 14.7a1 1 0 010-1.4L10.6 10 7.3 6.7a1 1 0 011.4-1.4l4 4a1 1 0 010 1.4l-4 4a1 1 0 01-1.4 0z"/></svg>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function SlideFeatures({ label, title, features, color }) {
  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        {label && <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: color || ACCENT, marginBottom: 6 }}>{label}</div>}
        <h2 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: 'var(--text)' }}>{title}</h2>
      </div>
      <div style={{ display: 'grid', gap: 12, maxWidth: 680, margin: '0 auto' }}>
        {features.map((f, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, padding: '16px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color || ACCENT}14`, color: color || ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {f.icon}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SlideScreenshot({ src, alt, caption, title }) {
  const [visible, setVisible] = useState(true);
  return (
    <div style={{ textAlign: 'center' }}>
      {title && <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 16px', color: 'var(--text)' }}>{title}</h2>}
      {visible && (
        <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 6px 32px rgba(0,0,0,0.08)', background: '#f8fafc', padding: 2, maxWidth: 760, margin: '0 auto' }}>
          <img src={src} alt={alt} style={{ width: '100%', display: 'block', borderRadius: 12 }}
            onError={() => setVisible(false)}
          />
        </div>
      )}
      {caption && (
        <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 14, fontStyle: 'italic', maxWidth: 560, margin: '14px auto 0' }}>
          {caption}
        </p>
      )}
    </div>
  );
}

export function SlidePricing({ price, period, items, ctaHref, ctaText, note }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: ACCENT, marginBottom: 6 }}>Pricing</div>
      <h2 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 24px', color: 'var(--text)' }}>One Plan. Full Access.</h2>
      <div style={{ display: 'inline-block', padding: '36px 52px', background: 'var(--card)', border: '2px solid var(--accent)', borderRadius: 20, boxShadow: '0 4px 24px rgba(79,124,224,0.1)' }}>
        <div style={{ fontSize: 56, fontWeight: 800, color: ACCENT, lineHeight: 1 }}>{price}</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>{period}</div>
        <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0', textAlign: 'left', display: 'grid', gap: 5 }}>
          {items.map((item, i) => (
            <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: 'var(--text)' }}>
              <svg viewBox="0 0 20 20" width="16" height="16" style={{ flexShrink: 0 }}><path fill="#22c55e" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"/></svg>
              {item}
            </li>
          ))}
        </ul>
        <a href={ctaHref || '/'} className="btn primary" style={{ padding: '12px 40px', fontSize: 15, borderRadius: 10, width: '100%', display: 'block', textAlign: 'center' }}>{ctaText || 'Get Started'}</a>
      </div>
      {note && (
        <div style={{ marginTop: 24, padding: '16px 24px', background: note.bg || 'rgba(22,163,74,0.06)', border: `1px solid ${note.border || 'rgba(22,163,74,0.2)'}`, borderRadius: 12, maxWidth: 440, margin: '24px auto 0' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: note.titleColor || '#166534', margin: '0 0 4px' }}>{note.title}</p>
          <p style={{ fontSize: 13, color: note.textColor || '#15803d', margin: 0, lineHeight: 1.6 }}>{note.text}</p>
        </div>
      )}
    </div>
  );
}

export function SlideContact({ title, subtitle, email, subject, buttonText }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <h2 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 12px' }}>{title}</h2>
      <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 460, margin: '0 auto 24px', lineHeight: 1.6 }}>{subtitle}</p>
      <a href={`mailto:${email}?subject=${encodeURIComponent(subject || '')}`} className="btn secondary" style={{ padding: '12px 32px', fontSize: 15, borderRadius: 10 }}>
        {buttonText || 'Contact Us'}
      </a>
    </div>
  );
}
