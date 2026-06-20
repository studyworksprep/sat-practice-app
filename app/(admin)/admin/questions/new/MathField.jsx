'use client';

// Visual equation input backed by MathLive's <math-field> web
// component. The admin builds an equation by typing / using the
// MathLive toolbar; the component reports the equation as a LaTeX
// string (MathLive's native value format), which the editor stores
// in a math node's `latex` attribute and the serializer wraps in
// \( … \) / \[ … \].
//
// MathLive registers a custom element and touches `window` /
// `customElements` at import time, so it is loaded lazily inside an
// effect (never during SSR). Until it resolves we render a small
// placeholder.

import { useEffect, useRef, useState } from 'react';

let mathlivePromise = null;
function loadMathlive() {
  if (!mathlivePromise) mathlivePromise = import('mathlive');
  return mathlivePromise;
}

export function MathField({ value, onChange, onEnter }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadMathlive().then(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);

  // Push external value into the field without clobbering an
  // in-progress edit (only write when they actually differ).
  useEffect(() => {
    const el = ref.current;
    if (!el || !ready) return;
    if (el.value !== (value ?? '')) el.value = value ?? '';
  }, [value, ready]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !ready) return;
    const onInput = () => onChange?.(el.value);
    const onKeyDown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onEnter?.(el.value); }
    };
    el.addEventListener('input', onInput);
    el.addEventListener('keydown', onKeyDown);
    // Focus the field as soon as it mounts so the admin can type.
    el.focus();
    return () => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('keydown', onKeyDown);
    };
  }, [ready, onChange, onEnter]);

  if (!ready) {
    return <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Loading math editor…</span>;
  }

  return (
    <math-field
      ref={ref}
      style={{
        fontSize: '1.15rem',
        padding: '0.35rem 0.6rem',
        border: '1px solid #9ca3af',
        borderRadius: 6,
        minWidth: '20rem',
        display: 'block',
        background: 'white',
      }}
    />
  );
}
