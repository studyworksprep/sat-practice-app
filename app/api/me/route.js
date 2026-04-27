import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/me — returns the current user's id and role
export const GET = legacyApiRoute(async () => {
  const { user, profile } = await requireUser();
  return NextResponse.json({
    id: user.id,
    role: profile?.role || 'student',
  });
});
