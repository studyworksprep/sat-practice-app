// Structured server-side logging. See docs/architecture-plan.md §3.5.
//
// Every log line is a single JSON object with a stable shape so Vercel's
// stdout capture (or whatever host) is searchable. Replaces ad-hoc
// `console.error` / `console.log` calls that currently serve as half-
// hearted logs.
//
// Usage from a route handler:
//
//   import { logger } from '@/lib/api/logger';
//   logger.info({ route: '/api/dashboard', userId: user.id }, 'rendered');
//   logger.error({ route: '/api/dashboard', err }, 'dashboard failed');
//
// The Phase 2 route wrapper will attach a requestId to every invocation
// automatically so logs can be correlated across a single request.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const ACTIVE_LEVEL = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function emit(level, fields, message) {
  if (LEVELS[level] < ACTIVE_LEVEL) return;
  const record = {
    level,
    time: new Date().toISOString(),
    ...normalize(fields),
    msg: message,
  };
  // Single stringify call, single stdout/stderr write. Keeps lines atomic
  // so log shippers don't split a record across two entries.
  const line = safeStringify(record);
  if (level === 'error' || level === 'warn') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

function normalize(fields) {
  if (!fields || typeof fields !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Error) {
      out[k] = { name: v.name, message: v.message, stack: v.stack };
    } else {
      out[k] = v;
    }
  }
  return out;
}

function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    // Circular structures, BigInts, etc. — fall back to a minimal shape
    // rather than throwing from inside the logger.
    return JSON.stringify({
      level: obj.level,
      time: obj.time,
      msg: obj.msg,
      err: 'log_serialization_failed',
    });
  }
}

export const logger = {
  debug: (fields, message) => emit('debug', fields, message),
  info: (fields, message) => emit('info', fields, message),
  warn: (fields, message) => emit('warn', fields, message),
  error: (fields, message) => emit('error', fields, message),
};

/**
 * Generate a short, URL-safe request id for correlating logs across a
 * single request. Used by the Phase 2 route wrapper; exposed here so
 * tests and the middleware can produce matching ids.
 */
export function newRequestId() {
  // 10 chars of base36 from crypto randomness.
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Non-crypto fallback; fine for log correlation, not for security.
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(36).padStart(2, '0');
  }
  return out.slice(0, 10);
}
