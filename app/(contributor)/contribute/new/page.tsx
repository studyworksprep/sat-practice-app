// New-submission wizard shell.
//
// Server Component for the initial data (the reference lists the wizard
// needs to render at all), client component for the flow itself.
//
// The attempt list is read through the caller's RLS-scoped client, so
// it is exactly "completed attempts this person can see": their own
// students for a tutor, nothing for an outside contributor — which is
// also why flow B quietly disappears for contributors rather than
// offering an empty picker.

import { redirect } from 'next/navigation';
import { requireUserPage } from '@/lib/api/auth';
import {
  NewSubmissionWizard,
  type ModuleShape,
  type AttemptOption,
  type CampaignOption,
} from './NewSubmissionWizard';
import s from '../Contribute.module.css';

export const dynamic = 'force-dynamic';

export default async function NewSubmissionPage() {
  const { user, profile, supabase } = await requireUserPage();

  const isStaff = ['teacher', 'manager', 'admin'].includes(profile.role);
  if (!isStaff && profile.role !== 'contributor') redirect('/');

  const [{ data: tests }, { data: attempts }, { data: campaigns }] = await Promise.all([
    supabase
      .from('practice_tests_v2')
      .select('id, code, name')
      .is('deleted_at', null)
      .order('name')
      .limit(100),
    // Flow B candidates. Excludes attempts the caller contributed for
    // already — one submission per attempt is the useful cardinality,
    // and a duplicate is just review work for no new information.
    supabase
      .from('practice_test_attempts_v2')
      .select('id, finished_at, practice_test_id, practice_test:practice_tests_v2(name)')
      .eq('status', 'completed')
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(60),
    supabase
      .from('bluebook_calibration_campaigns')
      .select('id, name, practice_test_id, requires_html_report, requires_score_image')
      .eq('is_active', true)
      .order('name'),
  ]);

  const { data: alreadyLinked } = await supabase
    .from('bluebook_submissions')
    .select('attempt_id')
    .eq('contributor_id', user.id)
    .not('attempt_id', 'is', null);

  const linkedIds = new Set((alreadyLinked ?? []).map((r) => r.attempt_id as string));

  // Grid shape per test: which questions each module contains.
  const testIds = (tests ?? []).map((t) => t.id as string);
  const { data: modules } = testIds.length
    ? await supabase
        .from('practice_test_modules_v2')
        .select('id, practice_test_id, subject_code, module_number')
        .in('practice_test_id', testIds)
    : { data: [] };

  const moduleIds = (modules ?? []).map((m) => m.id as string);
  const { data: items } = moduleIds.length
    ? await supabase
        .from('practice_test_module_items_v2')
        .select('practice_test_module_id, ordinal')
        .in('practice_test_module_id', moduleIds)
    : { data: [] };

  // Carry the real ordinals rather than a count. Production numbers
  // questions from 1, but that is data, not a guarantee — the grid
  // labels its cells with whatever the module actually uses, so a test
  // numbered differently still produces a response vector whose keys
  // match its module items.
  const ordinalsPerModule = new Map<string, number[]>();
  for (const item of items ?? []) {
    const key = item.practice_test_module_id as string;
    const list = ordinalsPerModule.get(key) ?? [];
    list.push(item.ordinal as number);
    ordinalsPerModule.set(key, list);
  }

  const moduleShapes: Record<string, ModuleShape> = {};
  for (const m of modules ?? []) {
    const testId = m.practice_test_id as string;
    const key = `${m.subject_code === 'RW' ? 'RW' : 'MATH'}${m.module_number === 2 ? 2 : 1}` as keyof ModuleShape;
    const ordinals = (ordinalsPerModule.get(m.id as string) ?? []).slice().sort((a, b) => a - b);
    if (!ordinals.length) continue;
    moduleShapes[testId] ??= { RW1: [], RW2: [], MATH1: [], MATH2: [] };
    // Module 2 exists twice (easy/hard); either variant answers "what
    // does the grid need to show", so keep the longer of the two.
    if (ordinals.length > moduleShapes[testId][key].length) {
      moduleShapes[testId][key] = ordinals;
    }
  }

  const attemptOptions: AttemptOption[] = (attempts ?? [])
    .filter((a) => !linkedIds.has(a.id as string))
    .map((a) => {
      const test = Array.isArray(a.practice_test) ? a.practice_test[0] : a.practice_test;
      return {
        id: a.id as string,
        practiceTestId: a.practice_test_id as string,
        testName: (test?.name as string) ?? 'Practice test',
        finishedAt: (a.finished_at as string) ?? null,
      };
    });

  return (
    <main className={s.container}>
      <nav className={s.eyebrow} style={{ marginBottom: 12 }}>
        <a href="/contribute">← Contributions</a>
      </nav>

      <header className={s.header}>
        <h1 className={s.h1}>New submission</h1>
        <p className={s.sub}>
          Pick whichever route matches what you already have. They all end in the same
          place; the only difference is how much typing you do.
        </p>
      </header>

      <NewSubmissionWizard
        tests={(tests ?? []).map((t) => ({
          id: t.id as string,
          name: (t.name as string) ?? '',
          code: (t.code as string) ?? '',
        }))}
        attempts={attemptOptions}
        moduleShapes={moduleShapes}
        canLinkAttempts={isStaff}
        campaigns={(campaigns ?? []).map((campaign) => ({
          id: campaign.id as string,
          name: campaign.name as string,
          practiceTestId: campaign.practice_test_id as string,
          requiresHtmlReport: Boolean(campaign.requires_html_report),
          requiresScoreImage: Boolean(campaign.requires_score_image),
        })) satisfies CampaignOption[]}
      />
    </main>
  );
}
