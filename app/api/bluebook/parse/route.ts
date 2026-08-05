import { apiRoute, ok, fail } from '@/lib/api/response';
import { requireRole } from '@/lib/api/auth';
import {
  parseBluebookReport,
  toResponseVector,
  computeModuleStats,
  BluebookParseError,
} from '@/lib/bluebook/parse-report';

// ============================================================
// POST /api/bluebook/parse
// ============================================================
// Reads a saved Bluebook "Details" export and returns a summary the
// caller can show before committing to anything. Every upload surface
// uses it: the tutor's upload card, the admin batch tool, and the
// contributor wizard.
//
// It writes nothing. The endpoints that DO write (upload-bluebook, the
// submission actions) re-parse the raw HTML themselves rather than
// trusting a payload derived from this response — this is a preview,
// not a source of record. That is the point of moving the parser
// server-side in the first place: the browser can no longer decide what
// a report says.
//
// **The response deliberately omits per-question correct answers.**
// A parsed report contains the College Board answer key for the whole
// form. Tutors can already see their students' item detail, but the
// `contributor` role is an outside account with no roster, and handing
// it a keyed answer list for every practice test in exchange for
// uploading one file would be a bad trade. Callers get counts, module
// stats, and the correct/incorrect vector — everything needed to
// confirm "yes, this is the right report" and nothing more.
//
// Body: { html: string } — the raw file contents.

interface ParseBody {
  html?: unknown;
}

export const POST = apiRoute(async (request: Request) => {
  // can_contribute() in the DB is is_teacher() OR is_contributor();
  // this is the application-layer mirror of it.
  await requireRole(['teacher', 'manager', 'admin', 'contributor']);

  let body: ParseBody;
  try {
    body = await request.json();
  } catch {
    return fail('Expected a JSON body of { html }', 400);
  }

  if (typeof body.html !== 'string' || !body.html.trim()) {
    return fail('No file contents were sent', 400);
  }

  let parsed;
  try {
    parsed = parseBluebookReport(body.html);
  } catch (err) {
    // A parse failure is a "wrong file" or "new report format" problem
    // for the person uploading, not a server fault. The parser's message
    // carries the structural counts that tell them which.
    if (err instanceof BluebookParseError) return fail(err.message, 400);
    throw err;
  }

  return ok({
    testName: parsed.testName,
    testDate: parsed.testDate,
    reportDate: parsed.reportDate,
    questionCount: parsed.questions.length,
    correctCounts: parsed.correctCounts,
    moduleStats: computeModuleStats(parsed),
    responses: toResponseVector(parsed),
  });
});
