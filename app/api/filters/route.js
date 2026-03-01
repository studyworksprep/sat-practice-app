import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

async function fetchAll(supabase, table, select, buildQuery) {
  const pageSize = 1000;
  let from = 0;
  let all = [];

  while (true) {
    let q = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (buildQuery) q = buildQuery(q);

    const { data, error } = await q;
    if (error) throw error;

    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

// GET /api/filters
// No params → returns { domains, topics } (topics include domain_name/code for grouping)
// ?domain=X → returns { topics } for that domain only (legacy, kept for compat)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain');
  const supabase = createClient();

  try {
    if (!domain) {
      // Fetch domains and ALL topics in parallel
      const [domainData, topicData] = await Promise.all([
        fetchAll(
          supabase,
          'question_taxonomy',
          'domain_name, domain_code',
          (q) => q.not('domain_name', 'is', null)
        ),
        fetchAll(
          supabase,
          'question_taxonomy',
          'domain_name, domain_code, skill_name, skill_code',
          (q) => q.not('skill_name', 'is', null)
        ),
      ]);

      const seenDomains = new Set();
      const domains = [];
      for (const row of domainData) {
        const key = `${row.domain_name}||${row.domain_code || ''}`;
        if (seenDomains.has(key)) continue;
        seenDomains.add(key);
        domains.push({ domain_name: row.domain_name, domain_code: row.domain_code || null });
      }
      domains.sort((a, b) => String(a.domain_name).localeCompare(String(b.domain_name)));

      const seenTopics = new Set();
      const topics = [];
      for (const row of topicData) {
        const key = `${row.domain_name}||${row.skill_name}`;
        if (seenTopics.has(key)) continue;
        seenTopics.add(key);
        topics.push({
          domain_name: row.domain_name,
          domain_code: row.domain_code || null,
          skill_name: row.skill_name,
          skill_code: row.skill_code || null,
        });
      }
      topics.sort((a, b) => String(a.skill_name).localeCompare(String(b.skill_name)));

      return NextResponse.json({ domains, topics });
    }

    // Legacy: single-domain topic fetch
    const data = await fetchAll(
      supabase,
      'question_taxonomy',
      'skill_name, skill_code',
      (q) => q.eq('domain_name', domain).not('skill_name', 'is', null)
    );

    const seen = new Set();
    const topics = [];
    for (const row of data) {
      const key = `${row.skill_name}||${row.skill_code || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      topics.push({ skill_name: row.skill_name, skill_code: row.skill_code || null });
    }

    topics.sort((a, b) => String(a.skill_name).localeCompare(String(b.skill_name)));
    return NextResponse.json({ topics });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
