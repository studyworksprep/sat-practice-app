// Readable names for ACT forms.
//
// act_questions.source_test is an import key ("ACT-2026-April-FormJ01",
// "ACT-25MC1") and stays the stable identifier in every table and
// URL. Students and tutors see a name instead: act_forms.display_name
// when an admin has set one, otherwise a default derived from the key
// here. Pure module (unit-tested); the one DB helper at the bottom
// turns act_forms rows into a namer.
//
// Key shapes in the bank:
//   ACT-2022-April-E25        dated released exam, form code E25
//   ACT-2024-Sep              dated, no code
//   ACT-2026-April-FormJ01    dated, "Form" prefix on the code
//   ACT-25MC1                 online multiple-choice practice test 1
//                             (2025 edition)

const MONTHS: Record<string, string> = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April',
  may: 'May', jun: 'June', jul: 'July', aug: 'August',
  sep: 'September', oct: 'October', nov: 'November', dec: 'December',
};

export type ParsedActSourceTest =
  | { kind: 'dated'; year: number; month: string; formCode: string | null }
  | { kind: 'online_mc'; year: number; number: number }
  | { kind: 'unknown' };

const DATED_RE = /^ACT-(\d{4})-([A-Za-z]{3,9})(?:-(?:Form)?([A-Za-z0-9]{1,8}))?$/i;
const ONLINE_MC_RE = /^ACT-(\d{2}|\d{4})-?MC(\d{1,2})$/i;

export function parseActSourceTest(sourceTest: string): ParsedActSourceTest {
  const key = (sourceTest ?? '').trim();
  const mc = ONLINE_MC_RE.exec(key);
  if (mc) {
    const yy = mc[1];
    const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    return { kind: 'online_mc', year, number: Number(mc[2]) };
  }
  const dated = DATED_RE.exec(key);
  if (dated) {
    const month = MONTHS[dated[2].slice(0, 3).toLowerCase()];
    if (month) {
      return {
        kind: 'dated',
        year: Number(dated[1]),
        month,
        formCode: dated[3] ? dated[3].toUpperCase() : null,
      };
    }
  }
  return { kind: 'unknown' };
}

/** The default name for a form key: "April 2022 ACT", "Online Multiple
 *  Choice Test 1 (2025)", or the key itself when it has no known shape. */
export function defaultActFormName(sourceTest: string): string {
  const p = parseActSourceTest(sourceTest);
  if (p.kind === 'dated') return `${p.month} ${p.year} ACT`;
  if (p.kind === 'online_mc') return `Online Multiple Choice Test ${p.number} (${p.year})`;
  return (sourceTest ?? '').trim();
}

/** Secondary detail worth keeping next to the name: the form code of a
 *  dated exam ("Form E25"). Null when there is nothing to add. */
export function actFormDetail(sourceTest: string): string | null {
  const p = parseActSourceTest(sourceTest);
  return p.kind === 'dated' && p.formCode ? `Form ${p.formCode}` : null;
}

/** The name to show: the admin's display_name when set, else the default. */
export function actFormName(sourceTest: string, displayName?: string | null): string {
  const custom = (displayName ?? '').trim();
  return custom || defaultActFormName(sourceTest);
}

export type ActFormNameRow = { source_test: string; display_name?: string | null };

/** Builds a namer over act_forms rows; keys without a row fall back to
 *  the derived default, so callers never need a row to exist. */
export function actFormNamer(rows: readonly ActFormNameRow[] | null | undefined): (sourceTest: string) => string {
  const custom = new Map<string, string>();
  for (const r of rows ?? []) {
    const name = (r.display_name ?? '').trim();
    if (r.source_test && name) custom.set(r.source_test, name);
  }
  return (sourceTest: string) => custom.get(sourceTest) ?? defaultActFormName(sourceTest);
}

/** Fetches every act_forms name (the table is a few dozen rows at most)
 *  and returns a namer. Pass the caller's supabase client. */
export async function loadActFormNamer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any },
): Promise<(sourceTest: string) => string> {
  const { data } = await supabase.from('act_forms').select('source_test, display_name');
  return actFormNamer((data ?? []) as ActFormNameRow[]);
}
