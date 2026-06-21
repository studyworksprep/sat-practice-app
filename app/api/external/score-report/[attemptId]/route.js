import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../lib/supabase/server';
import { validateExternalApiKey } from '../../../../../lib/externalAuth';
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
  if (!validateExternalApiKey(request)) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
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
