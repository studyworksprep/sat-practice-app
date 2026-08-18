/**
 * Drift alert for the nightly subscription reconciliation.
 *
 * Drift is not routine: every corrected field means a Stripe webhook was
 * missed, so a quiet run should be silent and a run that corrects
 * anything should reach a human. This is the monitoring half of the
 * reconciliation job.
 *
 * Soft failure by design — a mail problem must never fail the cron or
 * roll back corrections that were already applied. The send is awaited
 * rather than fired and forgotten: a floating promise dies when the
 * Vercel instance freezes at the end of the request.
 */
import { getResend, getFromAddress } from './client';

interface FieldDrift {
  field: string;
  stored: string | null;
  actual: string | null;
}

interface RowResult {
  userId: string;
  subscriptionId: string | null;
  outcome: string;
  drifts?: FieldDrift[];
  accessLoss?: boolean;
  error?: string;
}

interface Summary {
  checked: number;
  inSync: number;
  corrected: number;
  missingInStripe: number;
  skipped: number;
  errors: number;
  accessLosses: number;
  dryRun: boolean;
  results: RowResult[];
}

function getAdminEmail(): string {
  return process.env.ADMIN_NOTIFICATION_EMAIL || 'julio@studyworksprep.com';
}

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Rows worth a human's attention: anything corrected, missing or errored. */
function notable(results: RowResult[]): RowResult[] {
  return results.filter((r) => r.outcome !== 'in_sync' && r.outcome !== 'skipped_no_stripe_ref');
}

export function renderReconciliationEmail(summary: Summary): { subject: string; html: string; text: string } {
  const rows = notable(summary.results);
  const prefix = summary.dryRun ? '[dry run] ' : '';
  const subject =
    `${prefix}Subscription drift: ${summary.corrected + summary.missingInStripe} corrected, ` +
    `${summary.accessLosses} access change${summary.accessLosses === 1 ? '' : 's'}`;

  const lines = rows.map((r) => {
    const detail = r.error
      ? `error: ${r.error}`
      : (r.drifts ?? []).map((d) => `${d.field}: ${d.stored ?? 'NULL'} → ${d.actual ?? 'NULL'}`).join('; ');
    const flag = r.accessLoss ? ' [ACCESS REVOKED]' : '';
    return `user ${r.userId} (${r.subscriptionId ?? 'no subscription id'}) — ${r.outcome}${flag}: ${detail}`;
  });

  const text = [
    `Checked ${summary.checked} subscription(s) against Stripe.`,
    `In sync: ${summary.inSync} | Corrected: ${summary.corrected} | Missing in Stripe: ${summary.missingInStripe}`,
    `Skipped: ${summary.skipped} | Errors: ${summary.errors} | Access changes: ${summary.accessLosses}`,
    '',
    'Every correction below means a Stripe webhook was missed. If this is',
    'not a one-off, check the endpoint in the Stripe dashboard.',
    '',
    ...lines,
  ].join('\n');

  const html = [
    `<p>Checked <strong>${summary.checked}</strong> subscription(s) against Stripe.</p>`,
    `<p>In sync: ${summary.inSync} &middot; Corrected: <strong>${summary.corrected}</strong> &middot; ` +
      `Missing in Stripe: ${summary.missingInStripe} &middot; Skipped: ${summary.skipped} &middot; ` +
      `Errors: ${summary.errors} &middot; Access changes: <strong>${summary.accessLosses}</strong></p>`,
    `<p style="color:#64748b;font-size:14px;">Every correction below means a Stripe webhook was missed. ` +
      `If this is not a one-off, check the endpoint in the Stripe dashboard.</p>`,
    '<ul>',
    ...rows.map((r) => {
      const detail = r.error
        ? `error: ${escapeHtml(r.error)}`
        : (r.drifts ?? [])
            .map((d) => `${escapeHtml(d.field)}: ${escapeHtml(d.stored ?? 'NULL')} &rarr; ${escapeHtml(d.actual ?? 'NULL')}`)
            .join('; ');
      const flag = r.accessLoss ? ' <strong style="color:#b91c1c;">[ACCESS REVOKED]</strong>' : '';
      return `<li><code>${escapeHtml(r.userId)}</code> (${escapeHtml(r.subscriptionId ?? 'no subscription id')}) — ${escapeHtml(r.outcome)}${flag}: ${detail}</li>`;
    }),
    '</ul>',
  ].join('');

  return { subject, html, text };
}

export async function sendReconciliationAlert(
  summary: Summary,
): Promise<{ sent: boolean; reason?: string; id?: string }> {
  try {
    // A clean run is silent on purpose — an every-night email trains you
    // to ignore the one that matters.
    if (summary.corrected === 0 && summary.missingInStripe === 0 && summary.errors === 0) {
      return { sent: false, reason: 'nothing_to_report' };
    }

    const resend = getResend();
    if (!resend) return { sent: false, reason: 'no_api_key' };

    const to = getAdminEmail();
    if (!to) return { sent: false, reason: 'no_admin_email' };

    const { subject, html, text } = renderReconciliationEmail(summary);
    const result = await resend.emails.send({ from: getFromAddress(), to, subject, html, text });

    if (result.error) return { sent: false, reason: 'send_error' };
    return { sent: true, id: result.data?.id };
  } catch {
    return { sent: false, reason: 'exception' };
  }
}
