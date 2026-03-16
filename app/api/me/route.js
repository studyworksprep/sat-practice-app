import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /api/me — returns the current user's id and role
export async function GET() {
  const supabase = createClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', auth.user.id)
    .maybeSingle();

  return NextResponse.json({
    id: auth.user.id,
    role: profile?.role || 'student',
  });
}
