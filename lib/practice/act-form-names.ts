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
//   ACT-2022-April-E25          dated released exam, form code E25
//   ACT-2024-Sep                dated, no code
//   ACT-2026-April-FormJ01      dated, "Form" prefix on the code
//   ACT-25MC1                   ACT Online Practice Test, by its file
//                               code (2025 multiple-choice edition)
//   ACT-Online-Practice-Test-3  ACT Online Practice Test, by number
//
// Naming rule (owner, 2026-11-04): released exams read "Month Year"
// with no "ACT" and no form code ("April 2022"); online practice tests
// read "ACT Online Practice Test N". The form code stays in the key.

const MONTHS: Record<string, string> = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April',
  may: 'May', jun: 'June', jul: 'July', aug: 'August',
  sep: 'September', oct: 'October', nov: 'November', dec: 'December',
};
const MONTH_ORDER = Object.values(MONTHS);

// The online practice tests' file codes don't carry the test number:
// 25MC1 is Online Practice Test 1 and 25MC5 is Online Practice Test 2
// (owner, 2026-11-04). A code not listed here keeps its MC number.
const ONLINE_MC_TEST_NUMBER: Record<string, number> = {
  '2025-1': 1,
  '2025-5': 2,
};

export type ParsedActSourceTest =
  | { kind: 'dated'; year: number; month: string; formCode: string | null }
  | { kind: 'online_practice'; number: number }
  | { kind: 'unknown' };

const DATED_RE = /^ACT-(\d{4})-([A-Za-z]{3,9})(?:-(?:Form)?([A-Za-z0-9]{1,8}))?$/i;
const ONLINE_MC_RE = /^ACT-(\d{2}|\d{4})-?MC(\d{1,2})$/i;
const ONLINE_PRACTICE_RE = /^ACT-Online-Practice-Test-(\d{1,2})$/i;

export function parseActSourceTest(sourceTest: string): ParsedActSourceTest {
  const key = (sourceTest ?? '').trim();
  const practice = ONLINE_PRACTICE_RE.exec(key);
  if (practice) return { kind: 'online_practice', number: Number(practice[1]) };
  const mc = ONLINE_MC_RE.exec(key);
  if (mc) {
    const yy = mc[1];
    const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    const code = Number(mc[2]);
    return { kind: 'online_practice', number: ONLINE_MC_TEST_NUMBER[`${year}-${code}`] ?? code };
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

/** The default name for a form key: "April 2022", "ACT Online Practice
 *  Test 2", or the key itself when it has no known shape. */
export function defaultActFormName(sourceTest: string): string {
  const p = parseActSourceTest(sourceTest);
  if (p.kind === 'dated') return `${p.month} ${p.year}`;
  if (p.kind === 'online_practice') return `ACT Online Practice Test ${p.number}`;
  return (sourceTest ?? '').trim();
}

/** Display order for form lists: released exams newest first, then the
 *  online practice tests by number, then anything unrecognized by key. */
export function compareActForms(a: string, b: string): number {
  const rank = (key: string): [number, number, string] => {
    const p = parseActSourceTest(key);
    if (p.kind === 'dated') return [0, -(p.year * 12 + MONTH_ORDER.indexOf(p.month)), key];
    if (p.kind === 'online_practice') return [1, p.number, key];
    return [2, 0, key];
  };
  const [ga, na, ka] = rank(a);
  const [gb, nb, kb] = rank(b);
  return ga - gb || na - nb || ka.localeCompare(kb);
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
