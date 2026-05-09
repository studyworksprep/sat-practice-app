// Tutor-facing single-question inspection page. Teachers and admins
// drill into a questions_v2 row by id and see the full rendered
// question plus its canonical correct answer + rationale + taxonomy.
// Powered by <QuestionRenderer mode="teacher">.
//
// Entry points:
//   - typed URL (/tutor/review/<uuid>)
//   - tutor Roster / student detail surfaces
//   - admins use the parallel /admin/questions/<uuid> page; both
//     wrappers share QuestionReviewPage so the rendered content is
//     identical.
//
// No watermarking is applied to the rendered content here. The viewer
// is a trusted role (teacher / manager / admin) inspecting question
// bank content for pedagogy, flagging, or review purposes.

import { QuestionReviewPage } from '@/lib/practice/QuestionReviewPage';

export const dynamic = 'force-dynamic';

export default async function TutorReviewQuestionPage({ params }) {
  const { questionId } = await params;
  return (
    <QuestionReviewPage
      questionId={questionId}
      chrome={{
        backHref: '/tutor/dashboard',
        backLabel: 'Tutor dashboard',
        baseHref: '/tutor/review',
      }}
    />
  );
}
