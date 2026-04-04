/**
 * Validate an external API key from the x-api-key header.
 * Used for service-to-service calls (e.g. Lessonworks → Studyworks).
 */
export function validateExternalApiKey(request) {
  const key = request.headers.get('x-api-key');
  if (!key || !process.env.EXTERNAL_API_KEY) return false;
  return key === process.env.EXTERNAL_API_KEY;
}
