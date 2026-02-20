// Centralized query helpers.
// Adjust table/column names here if your schema differs.

import { createClient as createServerSupabase } from './supabase/server';

export async function getUser() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user ?? null;
}

export async function getCountsForUser(userId) {
  const supabase = createServerSupabase();
  // question_status is keyed by (user_id, question_id)
  const { data, error } = await supabase
    .from('question_status')
    .select('is_done, marked_for_review', { count: 'exact' });
  if (error) return { done: 0, review: 0 };

  let done = 0, review = 0;
  for (const row of data) {
    if (row.is_done) done++;
    if (row.marked_for_review) review++;
  }
  return { done, review };
}

export async function upsertQuestionStatus({ user_id, question_id, patch }) {
  const supabase = createServerSupabase();
  const payload = {
    user_id,
    question_id,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('question_status')
    .upsert(payload, { onConflict: 'user_id,question_id' });
  if (error) throw error;
}
