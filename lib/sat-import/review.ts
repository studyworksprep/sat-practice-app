import type { Json } from '@/lib/types/database';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type Presentation = { stem_html: string; rationale_html: string; options: Array<Record<string, Json | undefined> & { label: string; content_html: string }> };
export type ImportDetails = { question_type: 'mcq' | 'spr'; correct_answer: Json; domain_name: string | null; skill_name: string | null; difficulty: number | null; score_band: number | null; source_id: string; original_source_id?: string; source_external_id: string; hasAnswer: boolean };
export type Review = { clearStimulus?: true; purpose?: 'insert'; details?: ImportDetails; actor: string; target: string; updatedAt: string; expires: number; presentation: Presentation };
function signature(body: string, secret: string) {
  return createHmac('sha256', secret).update('sat-import-review-v1:').update(body).digest();
}
export function signReview(review: Review, secret: string) {
  const body = Buffer.from(JSON.stringify(review)).toString('base64url');
  return `${body}.${signature(body, secret).toString('base64url')}`;
}
export function readReview(token: string, secret: string, actor: string, now = Date.now()): Review {
  if (typeof token !== 'string' || token.length > 15_000_000) throw new Error('Invalid review. Compare the files again.');
  const parts = token.split('.');
  const expected = signature(parts[0], secret);
  const supplied = Buffer.from(parts[1] ?? '', 'base64url');
  if (parts.length !== 2 || supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) throw new Error('Invalid review. Compare the files again.');
  const review = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as Review;
  if (review.actor !== actor || review.expires <= now) throw new Error('This review expired or belongs to another admin. Compare the files again.');
  return review;
}

/** Preserve every option identity and grading property; replace only its markup. */
export function mergeOptions(existing: unknown, imported: Presentation['options']): Presentation['options'] {
  if (!Array.isArray(existing) || existing.length !== imported.length) throw new Error('Option sets differ. Edit this question separately.');
  const labels = imported.map(o => o.label);
  if (new Set(labels).size !== labels.length || new Set(existing.map(o => o?.label)).size !== labels.length) throw new Error('Option labels are ambiguous.');
  return existing.map(option => {
    const replacement = imported.find(o => o.label === option?.label);
    if (!replacement) throw new Error('Option labels differ. Edit this question separately.');
    const result = { ...option, content_html: replacement.content_html };
    delete result.content_html_rendered;
    return result;
  });
}

export function canCombineMathStimulus(domain: string | null | undefined): boolean {
  return ['Algebra', 'Advanced Math', 'Problem-Solving and Data Analysis', 'Geometry and Trigonometry'].includes(domain ?? '');
}
