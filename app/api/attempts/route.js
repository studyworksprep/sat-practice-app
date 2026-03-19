import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// POST /api/attempts
// body: { question_id, selected_option_id?, response_text?, time_spent_ms? }
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { question_id, selected_option_id, response_text, time_spent_ms, source, teacher_mode } = body || {};
    if (!question_id) return NextResponse.json({ error: 'question_id required' }, { status: 400 });
    const VALID_SOURCES = ['practice', 'practice_test', 'review'];
    const attemptSource = VALID_SOURCES.includes(source) ? source : 'practice';

    const supabase = createClient();

    // 1) Auth + version fetch in parallel
    const [authResult, verResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('question_versions')
        .select('id, question_id, question_type, created_at')
        .eq('question_id', question_id)
        .eq('is_current', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const { data: auth, error: authErr } = authResult;
    if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const user = auth.user;

    const { data: ver, error: verErr } = verResult;
    if (verErr) return NextResponse.json({ error: verErr.message }, { status: 400 });
    if (!ver) return NextResponse.json({ error: 'No current version found' }, { status: 404 });

    // 2) Correct answer + existing status in parallel (both depend on ver/user)
    const [caResult, stResult] = await Promise.all([
      supabase
        .from('correct_answers')
        .select('correct_option_id, correct_text')
        .eq('question_version_id', ver.id)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('question_status')
        .select('attempts_count, correct_attempts_count, marked_for_review, status_json, is_done, last_is_correct')
        .eq('user_id', user.id)
        .eq('question_id', question_id)
        .maybeSingle(),
    ]);

    const { data: ca, error: caError } = caResult;
    if (caError) {
      return NextResponse.json(
        { error: `correct_answers select failed: ${caError.message}` },
        { status: 500 }
      );
    }

    if (
      !ca ||
      (ver.question_type === 'mcq' && !ca.correct_option_id) ||
      (ver.question_type === 'spr' && !ca.correct_text)
    ) {
      return NextResponse.json({ error: 'Correct answer missing for this question version' }, { status: 400 });
    }

    // 3) Determine correctness
    let is_correct = false;

    if (ver.question_type === 'mcq') {
      if (!selected_option_id) {
        return NextResponse.json({ error: 'selected_option_id required for mcq' }, { status: 400 });
      }
      is_correct = String(ca?.correct_option_id ?? '') === String(selected_option_id);
    } else if (ver.question_type === 'spr') {
      if (typeof response_text !== 'string' || response_text.trim() === '') {
        return NextResponse.json({ error: 'response_text required for spr' }, { status: 400 });
      }

      const norm = (s) =>
        String(s ?? '')
          .trim()
          .replace(/\u2212/g, '-')
          .replace(/\s+/g, ' ')
          .toLowerCase();

      const toAnswerList = (ct) => {
        if (Array.isArray(ct)) return ct;
        if (typeof ct === 'string') {
          const t = ct.trim();
          if (t.startsWith('[') && t.endsWith(']')) {
            try {
              const parsed = JSON.parse(t);
              if (Array.isArray(parsed)) return parsed;
            } catch {}
          }
          return [t];
        }
        if (ct == null) return [];
        return [String(ct)];
      };

      const accepted = toAnswerList(ca?.correct_text);
      const resp = norm(response_text);

      is_correct = accepted.some((a) => {
        if (norm(a) === resp) return true;
        // Numeric equivalence: 0.88 should match .88, 3.0 should match 3, etc.
        const nA = parseFloat(a), nR = parseFloat(response_text);
        return !isNaN(nA) && !isNaN(nR) && nA === nR;
      });
    }

    const { data: st, error: stErr } = stResult;
    if (stErr) return NextResponse.json({ error: stErr.message }, { status: 400 });

    // Teacher Mode: return correctness without recording anything
    if (teacher_mode) {
      return NextResponse.json({
        ok: true,
        is_correct,
        attempts_count: 0,
        correct_attempts_count: 0,
        correct_option_id: ca?.correct_option_id ?? null,
        correct_text: ca?.correct_text ?? null,
      });
    }

    const attempts_count = (st?.attempts_count ?? 0) + 1;
    const correct_attempts_count = (st?.correct_attempts_count ?? 0) + (is_correct ? 1 : 0);

    // 4) Insert attempt + upsert status in parallel
    const [insResult, upResult] = await Promise.all([
      supabase.from('attempts').insert({
        user_id: user.id,
        question_id,
        is_correct,
        selected_option_id: ver.question_type === 'mcq' ? selected_option_id : null,
        response_text: ver.question_type === 'spr' ? response_text : null,
        time_spent_ms: Number.isFinite(Number(time_spent_ms)) ? Number(time_spent_ms) : null,
        source: attemptSource,
      }),
      supabase
        .from('question_status')
        .upsert(
          {
            user_id: user.id,
            question_id,
            is_done: true,
            attempts_count,
            correct_attempts_count,
            last_attempt_at: new Date().toISOString(),
            last_is_correct: st?.is_done ? st.last_is_correct : is_correct,
            status_json: (() => {
              const prev = (st?.status_json && typeof st.status_json === 'object') ? st.status_json : {};
              const extra = {};
              if (ver.question_type === 'mcq') extra.last_selected_option_id = selected_option_id ?? null;
              if (ver.question_type === 'spr') extra.last_response_text = response_text ?? '';
              return { ...prev, ...extra };
            })(),
            updated_at: new Date().toISOString(),
            marked_for_review: st?.marked_for_review ?? false,
          },
          { onConflict: 'user_id,question_id' }
        ),
    ]);

    const { error: insErr } = insResult;
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

    const { error: upErr } = upResult;
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    // Bump global accuracy counters on the question version (first attempt only)
    if ((st?.attempts_count ?? 0) === 0) {
      supabase.rpc('increment_version_accuracy', {
        entries: JSON.stringify([{ version_id: ver.id, is_correct }]),
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      is_correct,
      attempts_count,
      correct_attempts_count,
      correct_option_id: ca?.correct_option_id ?? null,
      correct_text: ca?.correct_text ?? null,
    });
  } catch (e) {
    console.error('POST /api/attempts crashed:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
