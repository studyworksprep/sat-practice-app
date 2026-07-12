import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../lib/supabase/server';
import { requireExternalApiAccess } from '../../../../../lib/externalAuth';
import { generateScoreReportPdf } from '../../../../../lib/generateScoreReportPdf';
import { loadTestResults } from '../../../../../lib/practice-test/load-test-results';

// GET /api/external/score-report/[attemptId]
// Returns the practice-test score report PDF for a completed
// attempt. Authenticated via x-api-key header. Service-role client
// bypasses RLS so external integrations can fetch any completed
// attempt by id.
//
// Built on the same loadTestResults loader the in-app results page
// uses, so the PDF stays in sync with what students and tutors see
// without a parallel rebuilder to maintain. Pre-cutover Bluebook
// uploads built the PDF from practice_test_attempts.metadata, which
// no longer exists on v2 attempts; the v2 attempt-family tables
// carry the same information in normalized form.
export async function GET(request, props) {
  const params = await props.params;
  const access = await requireExternalApiAccess(request, {
    scope: 'score-report',
    limit: 30,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { attemptId } = params;
  const supabase = createServiceClient();

  const { data: attempt, error: attErr } = await supabase
    .from('practice_test_attempts_v2')
    .select('id, user_id, status')
    .eq('id', attemptId)
    .maybeSingle();

  if (attErr) return NextResponse.json({ error: attErr.message }, { status: 500 });
  if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Optional per-student scoping: when the caller supplies
  // ?studentId=, the attempt must belong to that student. Existing
  // consumers that omit it keep working; consumers that adopt it
  // can no longer be tricked into fetching another student's report
  // via a swapped attempt id.
  const expectedStudent = new URL(request.url).searchParams.get('studentId');
  if (expectedStudent && attempt.user_id !== expectedStudent) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (attempt.status !== 'completed') {
    return NextResponse.json({ error: 'Attempt not yet completed' }, { status: 400 });
  }

  // viewerUserId = the attempt owner so watermarks attribute to the
  // student (this PDF is for them or their party). viewerRole=admin
  // because the external integration runs as service role.
  const result = await loadTestResults({
    supabase,
    attemptId,
    viewerUserId: attempt.user_id,
    viewerRole: 'admin',
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.code }, { status: 500 });
  }

  const { pdfData } = result.props;
  const doc = generateScoreReportPdf(pdfData);
  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  const filename = `${(pdfData.test_name || 'Practice-Test').replace(/[^a-zA-Z0-9]+/g, '-')}-Score-Report.pdf`;

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdfBuffer.length),
    },
  });
}
