import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /api/filters
// - returns distinct domains
// GET /api/filters?domain=<domain_name>
// - returns distinct topics (skills) for that domain
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain');

  const supabase = createClient();

  if (!domain) {
    const { data, error } = await supabase
      .from('question_taxonomy')
      .select('domain_name, domain_code')
      .not('domain_name', 'is', null);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const seen = new Set();
    const domains = [];
    for (const row of (data || [])) {
      const key = `${row.domain_name}||${row.domain_code || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      domains.push({ domain_name: row.domain_name, domain_code: row.domain_code || null });
    }

    domains.sort((a, b) => String(a.domain_name).localeCompare(String(b.domain_name)));
    return NextResponse.json({ domains });
  }

  const { data, error } = await supabase
    .from('question_taxonomy')
    .select('skill_name, skill_code')
    .eq('domain_name', domain)
    .not('skill_name', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const seen = new Set();
  const topics = [];
  for (const row of (data || [])) {
    const key = `${row.skill_name}||${row.skill_code || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push({ skill_name: row.skill_name, skill_code: row.skill_code || null });
  }
  topics.sort((a, b) => String(a.skill_name).localeCompare(String(b.skill_name)));
  return NextResponse.json({ topics });
}
