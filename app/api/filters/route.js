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
// No params → returns { domains, topics, counts }
//   counts = { [domain_name]: { count: N, topics: { [skill_key]: M } } }
//   (unfiltered totals; contextual filtering is handled by /api/domain-counts)
// ?domain=X → returns { topics } for that domain only (legacy, kept for compat)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain');
  const supabase = createClient();

  try {
    if (!domain) {
      // Single pass: one query builds the domain list, topic list, and unfiltered counts
      const rows = await fetchAll(
        supabase,
        'question_taxonomy',
        'question_id, domain_name, domain_code, skill_name, skill_code',
        (q) => q.not('domain_name', 'is', null)
      );

      const seenDomains = new Set();
      const seenTopics  = new Set();
      const domains     = [];
      const topics      = [];
      const byDomain    = {};

      for (const row of rows) {
        // Domain list (unique)
        const domainKey = `${row.domain_name}||${row.domain_code || ''}`;
        if (!seenDomains.has(domainKey)) {
          seenDomains.add(domainKey);
          domains.push({ domain_name: row.domain_name, domain_code: row.domain_code || null });
        }

        // Topic list (unique, skill_name present)
        if (row.skill_name) {
          const topicKey = `${row.domain_name}||${row.skill_code || row.skill_name}`;
          if (!seenTopics.has(topicKey)) {
            seenTopics.add(topicKey);
            topics.push({
              domain_name: row.domain_name,
              domain_code: row.domain_code || null,
              skill_name:  row.skill_name,
              skill_code:  row.skill_code  || null,
            });
          }
        }

        // Counts: unique question_id per domain and per topic
        if (!byDomain[row.domain_name]) {
          byDomain[row.domain_name] = { ids: new Set(), topics: {} };
        }
        byDomain[row.domain_name].ids.add(row.question_id);
        if (row.skill_name) {
          const skillKey = row.skill_code || row.skill_name;
          if (!byDomain[row.domain_name].topics[skillKey]) {
            byDomain[row.domain_name].topics[skillKey] = new Set();
          }
          byDomain[row.domain_name].topics[skillKey].add(row.question_id);
        }
      }

      domains.sort((a, b) => String(a.domain_name).localeCompare(String(b.domain_name)));
      topics.sort((a, b) => String(a.skill_name).localeCompare(String(b.skill_name)));

      const counts = {};
      for (const [dn, { ids, topics: tmap }] of Object.entries(byDomain)) {
        counts[dn] = {
          count: ids.size,
          topics: Object.fromEntries(
            Object.entries(tmap).map(([skill, skillIds]) => [skill, skillIds.size])
          ),
        };
      }

      return NextResponse.json({ domains, topics, counts });
    }

    // Legacy: single-domain topic fetch
    const data = await fetchAll(
      supabase,
      'question_taxonomy',
      'skill_name, skill_code',
      (q) => q.eq('domain_name', domain).not('skill_name', 'is', null)
    );

    const seen   = new Set();
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
