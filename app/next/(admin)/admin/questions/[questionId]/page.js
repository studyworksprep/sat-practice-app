// Admin-tree question detail page. Mirror of /tutor/review/<id> but
// kept inside the (admin) route group so the admin nav (Operate ·
// Teach · Train) stays visible while an admin drills into a row from
// the /admin/questions browser. Both pages share QuestionReviewPage,
// so the rendered content + flag controls + notes are identical.

import { QuestionReviewPage } from '@/lib/practice/QuestionReviewPage';

export const dynamic = 'force-dynamic';

export default async function AdminQuestionDetailPage({ params }) {
  const { questionId } = await params;
  return (
    <QuestionReviewPage
      questionId={questionId}
      chrome={{
        backHref: '/admin/questions',
        backLabel: 'Admin · Questions',
        baseHref: '/admin/questions',
        generateHref: `/admin/questions/${questionId}/generate`,
      }}
    />
  );
}
