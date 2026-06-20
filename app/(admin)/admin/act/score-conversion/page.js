// Admin → ACT → Score conversion.
//
// Lets an admin populate act_score_conversion so the ACT
// practice-test results page can produce scaled scores (per
// docs/architecture-plan.md §3.4 — ACT practice tests cache
// scaled scores at finalize using this table; with the table
// empty, the results page falls back to raw counts).
//
// Page structure:
//   - Form picker. Lists every source_test that already has rows
//     in act_score_conversion plus every source_test surfaced on
//     act_questions (so a newly-seeded form is reachable
//     immediately, even before its scaling table exists). Plus a
//     "+ New form" action that seeds a placeholder row so the
//     admin can begin editing.
//   - Section tabs. English / Math / Reading / Science.
//   - Editor for the selected (form, section). Two paths share
//     one upsert action: inline cell-editing of a (raw, scaled)
//     table, or pasting a CSV.
//
// The page itself is a Server Component; the editor is the
// ConversionEditor client island below.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireRole } from '@/lib/api/auth';
import { sectionLabel, ACT_SECTIONS } from '@/lib/practice/act-taxonomy';
import { ConversionEditor } from './ConversionEditor';
import { CreateFormButton } from './CreateFormButton';
import s from './ScoreConversion.module.css';

export const dynamic = 'force-dynamic';

const SECTIONS_LIST = ACT_SECTIONS;

export default async function AdminActScoreConversionPage({ searchParams }) {
  let supabase;
  try {
    ({ supabase } = await requireRole(['admin']));
  } catch {
    redirect('/');
  }

  const sp = (await searchParams) ?? {};
  const formParam = typeof sp.form === 'string' ? sp.form.trim() : '';
  const sectionParam = typeof sp.section === 'string' ? sp.section.toLowerCase() : 'english';
  const section = SECTIONS_LIST.includes(sectionParam) ? sectionParam : 'english';

  // All forms known to the system. Union of (forms with rows in
  // the conversion table) ∪ (forms with questions in act_questions).
  // The page-rendering shape carries a few extra flags per form so
  // the picker can label them ("has table" vs "no table yet").
  const [
    { data: conversionRows },
    { data: questionRows },
  ] = await Promise.all([
    supabase
      .from('act_score_conversion')
      .select('source_test, section, raw_score, scaled_score')
      .order('source_test', { ascending: true })
      .order('section', { ascending: true })
      .order('raw_score', { ascending: true }),
    supabase
      .from('act_questions')
      .select('source_test')
      .not('source_test', 'is', null),
  ]);

  const formsWithRows = new Set();
  const sectionsByForm = new Map();
  const rowsByFormSection = new Map();
  for (const r of conversionRows ?? []) {
    formsWithRows.add(r.source_test);
    let secs = sectionsByForm.get(r.source_test);
    if (!secs) {
      secs = new Set();
      sectionsByForm.set(r.source_test, secs);
    }
    secs.add(r.section);
    const key = `${r.source_test}::${r.section}`;
    const arr = rowsByFormSection.get(key) ?? [];
    arr.push({ raw_score: r.raw_score, scaled_score: r.scaled_score });
    rowsByFormSection.set(key, arr);
  }
  const formsFromQuestions = new Set(
    (questionRows ?? []).map((r) => r.source_test).filter(Boolean),
  );

  const allForms = Array.from(new Set([...formsWithRows, ...formsFromQuestions]))
    .sort((a, b) => a.localeCompare(b));

  const currentForm = formParam || allForms[0] || null;

  if (formParam && !allForms.includes(formParam)) {
    // Form not known yet — nothing to render. The picker still
    // offers the "+ New form" path to seed it.
  }

  const rows = currentForm
    ? rowsByFormSection.get(`${currentForm}::${section}`) ?? []
    : [];

  return (
    <main className={s.container}>
      <header className={s.header}>
        <Link href="/admin" className={s.backLink}>← Admin</Link>
        <h1 className={s.h1}>ACT score conversion</h1>
        <p className={s.sub}>
          Populate raw → scaled tables per form per section.
          Saved values feed the ACT practice-test results page.
          Inline-edit the table below, or paste a CSV (two columns:
          raw_score, scaled_score).
        </p>
      </header>

      <section className={s.formPicker}>
        <div className={s.pickerLabel}>Form</div>
        <div className={s.pickerRow}>
          {allForms.length === 0 ? (
            <span className={s.pickerEmpty}>No forms yet.</span>
          ) : (
            <ul className={s.formList}>
              {allForms.map((form) => {
                const active = form === currentForm;
                const hasTable = formsWithRows.has(form);
                return (
                  <li key={form}>
                    <Link
                      href={`/admin/act/score-conversion?form=${encodeURIComponent(form)}&section=${section}`}
                      className={`${s.formChip} ${active ? s.formChipActive : ''}`}
                    >
                      {form}
                      {!hasTable && <span className={s.formChipNoTable}>no table</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <CreateFormButton />
        </div>
      </section>

      {currentForm && (
        <>
          <nav className={s.sectionTabs} aria-label="Section">
            {SECTIONS_LIST.map((sec) => (
              <Link
                key={sec}
                href={`/admin/act/score-conversion?form=${encodeURIComponent(currentForm)}&section=${sec}`}
                className={`${s.sectionTab} ${section === sec ? s.sectionTabActive : ''}`}
                aria-current={section === sec ? 'page' : undefined}
              >
                {sectionLabel(sec)}
                <span className={s.sectionTabCount}>
                  {sectionsByForm.get(currentForm)?.has(sec)
                    ? (rowsByFormSection.get(`${currentForm}::${sec}`) ?? []).length
                    : 0}
                </span>
              </Link>
            ))}
          </nav>

          <ConversionEditor
            sourceTest={currentForm}
            section={section}
            sectionLabel={sectionLabel(section)}
            initialRows={rows}
          />
        </>
      )}
    </main>
  );
}
