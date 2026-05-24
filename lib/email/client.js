// Lazy-init getter for the Resend SDK. Same pattern as lib/stripe.js:
// constructing the client at module import would break Vercel builds
// when RESEND_API_KEY is unset during static analysis.
//
// Call getResend() from inside a request handler. Returns null when
// the env var is missing so callers can short-circuit gracefully
// instead of throwing — a missing welcome email is a soft failure,
// not a reason to break signup.

import { Resend } from 'resend';

let _resend;

export function getResend() {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

export function getFromAddress() {
  return process.env.EMAIL_FROM || 'Studyworks <welcome@studyworksprep.com>';
}
