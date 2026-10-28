// Error-log saves need a stable URL: a practice/review tab can stay open
// across deployments, after its build's Server Action IDs have expired.
import { requireUser } from '@/lib/api/auth';
import { apiRoute, fail, ok } from '@/lib/api/response';
import { saveErrorNote } from '@/lib/practice/error-notes-actions';

const handlePost = apiRoute(async (request: Request) => {
  // Authenticate before parsing input. The shared action also uses this
  // cached, request-scoped identity and writes through the owner's RLS.
  await requireUser();

  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return fail('Invalid request origin', 403);
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return fail('Expected a JSON body', 415);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }
  const body = input as { questionId?: unknown; body?: unknown } | null;
  if (typeof body?.questionId !== 'string'
      || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(body.questionId)) {
    return fail('A valid questionId is required', 400);
  }
  if (typeof body.body !== 'string') return fail('Note body must be text', 400);

  const result = await saveErrorNote(body.questionId, { body: body.body });
  if (!result.ok) return fail(result.error, 400);
  return ok({ note: result.note });
});

export async function POST(request: Request) {
  return handlePost(request);
}
