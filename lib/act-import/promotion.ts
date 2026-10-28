import { normalizeMathOptions, type ActOption } from './options.ts';

/** Persist a legacy draft's reduction before publishing so approval retries reuse it. */
export async function normalizeDraftMathOptions<T extends {
  id: string;
  section: string;
  options_json: ActOption[] | null;
}>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  draft: T,
): Promise<T> {
  if (!draft.options_json) return draft;
  const options = normalizeMathOptions(draft.section, draft.options_json);
  if (options === draft.options_json) return draft;

  const { data, error } = await supabase
    .from('act_question_drafts')
    .update({ options_json: options })
    .eq('id', draft.id)
    .eq('status', 'ready_for_review')
    .eq('options_json', JSON.stringify(draft.options_json))
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Normalize Math options failed: ${error.message}`);
  if (!data) throw new Error('Draft changed during approval; reload and try again');
  return { ...draft, options_json: options };
}
