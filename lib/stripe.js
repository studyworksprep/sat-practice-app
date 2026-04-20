// Canonical lazy-init getter for the Stripe SDK. See docs/architecture-plan.md §3.3.
//
// Why this exists: the `new Stripe()` constructor reads STRIPE_SECRET_KEY
// at call time. Constructing it eagerly at module import (e.g. `const
// stripe = new Stripe(process.env.STRIPE_SECRET_KEY)` at top of file) is
// the pattern that broke the Vercel build earlier this year — Next.js
// statically analyzes imports, and an undefined env var during build
// caused the SDK to throw mid-compile.
//
// Every Stripe call site in the app should `import { getStripe } from
// '@/lib/stripe'` and call `getStripe()` from inside a request handler.
// The SDK is then constructed once, cached at module scope, and never
// touched at import time.
//
// This file replaces three duplicated `let _stripe; function getStripe()`
// blocks in:
//   - app/api/webhooks/stripe/route.js
//   - app/api/billing/create-checkout/route.js
//   - app/api/billing/create-portal/route.js
// The refactor to point each of those at this helper happens in Phase 2.

import Stripe from 'stripe';

let _stripe;

export function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  _stripe = new Stripe(key);
  return _stripe;
}
