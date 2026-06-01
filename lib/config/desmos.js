// Single source of truth for the Desmos Graphing Calculator API key
// and the calculator script URL.
//
// The key is read from NEXT_PUBLIC_DESMOS_API_KEY with no in-code
// fallback: a missing env var surfaces as an unloaded calculator
// (and a dev-time console warning) rather than silently shipping a
// hardcoded key from source. Set NEXT_PUBLIC_DESMOS_API_KEY in every
// environment — see .env.example. Desmos browser keys are public and
// domain-restricted by design, so this value is safe to expose; the
// point of removing the literal is to avoid drift and accidental
// reliance on one developer's key.

export const DESMOS_API_VERSION = 'v1.11';

export const DESMOS_API_KEY = process.env.NEXT_PUBLIC_DESMOS_API_KEY || '';

if (!DESMOS_API_KEY && process.env.NODE_ENV !== 'production') {
  console.warn(
    '[desmos] NEXT_PUBLIC_DESMOS_API_KEY is not set — the Desmos calculator will not load. ' +
      'Add it to your environment (see .env.example).',
  );
}

// Builds the calculator.js script URL. When the key is missing we
// still emit the base URL (without an apiKey param) so the tag is
// well-formed; Desmos will decline to initialise, which is the
// intended "fail visibly, not silently with someone else's key"
// behavior.
export function desmosCalculatorSrc() {
  const base = `https://www.desmos.com/api/${DESMOS_API_VERSION}/calculator.js`;
  return DESMOS_API_KEY ? `${base}?apiKey=${DESMOS_API_KEY}` : base;
}
