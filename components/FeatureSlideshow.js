'use client';

import { useCallback, useEffect, useState } from 'react';

const ACCENT = 'var(--accent, #4f7ce0)';

const arrowBtnStyle = (enabled) => ({
  position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 20,
  width: 56, height: 80, borderRadius: 12, border: 'none',
  background: enabled ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.4)',
  boxShadow: enabled ? '0 2px 12px rgba(0,0,0,0.12)' : 'none',
  cursor: enabled ? 'pointer' : 'default',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: enabled ? 'var(--text, #1e293b)' : 'var(--border, #ccc)',
  transition: 'all 0.15s',
});

const panelStyle = {
  background: 'rgba(255,255,255,0.97)',
  border: '1px solid var(--border, #e2e8f0)',
  borderRadius: 16,
  padding: '32px 36px',
  boxShadow: '0 2px 16px rgba(0,0,0,0.05)',
  maxWidth: 780,
  margin: '0 auto',
  width: '100%',
};

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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', background: 'var(--bg, #f4f6f9)' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.97)', position: 'relative', zIndex: 20, backdropFilter: 'blur(8px)' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <img src="/studyworks-logo.png" alt="StudyWorks" style={{ height: 28 }} />
        </a>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href="/" className="btn primary" style={{ padding: '6px 20px', fontSize: 13, borderRadius: 8 }}>Get Started</a>
          <a href="/" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none', padding: '6px 12px' }}>Home</a>
        </div>
      </div>

      {/* Main area with side arrows */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Left arrow */}
        <button onClick={prev} disabled={!canPrev} style={{ ...arrowBtnStyle(canPrev), left: 12 }} aria-label="Previous slide">
          <svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
        </button>

        {/* Slide content */}
        <div
          key={current}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            padding: '24px 80px', maxWidth: 1000, margin: '0 auto', width: '100%', minHeight: 0,
            animation: 'fsSlideIn 0.3s ease-out',
          }}
        >
          {slide.content}
        </div>

        {/* Right arrow */}
        <button onClick={next} disabled={!canNext} style={{ ...arrowBtnStyle(canNext), right: 12 }} aria-label="Next slide">
          <svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        </button>
      </div>

      {/* Bottom nav */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, padding: '14px 20px', background: 'rgba(255,255,255,0.97)', borderTop: '1px solid var(--border)', position: 'relative', zIndex: 20 }}>
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => go(i)}
            aria-label={`Slide ${i + 1}`}
            style={{
              width: i === current ? 28 : 10, height: 10,
              borderRadius: 5, border: 'none', cursor: 'pointer',
              background: i === current ? ACCENT : 'var(--border)',
              transition: 'all 0.2s',
            }}
          />
        ))}
        <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 16 }}>
          {current + 1} / {total}
        </span>
      </div>

      <style>{`
        @keyframes fsSlideIn {
          from { opacity: 0; transform: translateX(${direction >= 0 ? '40' : '-40'}px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

/* ─── Slide building blocks ─── */

export function SlideHero({ title, subtitle, ctaHref, ctaText, altHref, altText }) {
  return (
    <div style={panelStyle}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 40, fontWeight: 800, margin: '0 0 16px', color: 'var(--text)', lineHeight: 1.15 }}>{title}</h1>
        <p style={{ fontSize: 18, color: 'var(--muted)', maxWidth: 540, margin: '0 auto', lineHeight: 1.6 }}>{subtitle}</p>
        {(ctaHref || altHref) && (
          <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
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
    </div>
  );
}

export function SlideFeatures({ label, title, features, color }) {
  return (
    <div style={panelStyle}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        {label && <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: color || ACCENT, marginBottom: 6 }}>{label}</div>}
        <h2 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: 'var(--text)' }}>{title}</h2>
      </div>
      <div style={{ display: 'grid', gap: 12, maxWidth: 680, margin: '0 auto' }}>
        {features.map((f, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, padding: '16px 20px', background: 'var(--surface, #f8fafc)', border: '1px solid var(--border)', borderRadius: 12 }}>
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

export function SlideScreenshot({ src, alt, title, description }) {
  const [visible, setVisible] = useState(true);
  return (
    <div style={panelStyle}>
      <div style={{ display: 'grid', gap: 20 }}>
        {/* Text section */}
        <div>
          {title && <h2 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 10px', color: 'var(--text)' }}>{title}</h2>}
          {description && <p style={{ fontSize: 15, color: 'var(--muted)', margin: 0, lineHeight: 1.7 }}>{description}</p>}
        </div>
        {/* Image */}
        {visible && (
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.07)', background: '#f8fafc', padding: 2 }}>
            <img src={src} alt={alt} style={{ width: '100%', display: 'block', borderRadius: 10 }}
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
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: ACCENT, marginBottom: 6 }}>Pricing</div>
        <h2 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 24px', color: 'var(--text)' }}>One Plan. Full Access.</h2>
        <div style={{ display: 'inline-block', padding: '32px 48px', border: '2px solid var(--accent)', borderRadius: 20, background: 'var(--surface, #f8fafc)' }}>
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
          <div style={{ marginTop: 20, padding: '16px 24px', background: note.bg || 'rgba(22,163,74,0.06)', border: `1px solid ${note.border || 'rgba(22,163,74,0.2)'}`, borderRadius: 12, maxWidth: 440, margin: '20px auto 0' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: note.titleColor || '#166534', margin: '0 0 4px' }}>{note.title}</p>
            <p style={{ fontSize: 13, color: note.textColor || '#15803d', margin: 0, lineHeight: 1.6 }}>{note.text}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function SlideContact({ title, subtitle, email, subject, buttonText }) {
  return (
    <div style={panelStyle}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 12px' }}>{title}</h2>
        <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 460, margin: '0 auto 24px', lineHeight: 1.6 }}>{subtitle}</p>
        <a href={`mailto:${email}?subject=${encodeURIComponent(subject || '')}`} className="btn secondary" style={{ padding: '12px 32px', fontSize: 15, borderRadius: 10 }}>
          {buttonText || 'Contact Us'}
        </a>
      </div>
    </div>
  );
}
