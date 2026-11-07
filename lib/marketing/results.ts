// SAT results figures for the public marketing pages (landing page and
// the student / teacher feature decks).
//
// Source of truth is the Homepage repo (www.studyworksprep.com), which
// stores the anonymous per-student rows in `src/lib/results-data.ts`
// and publishes them on its Results page. These are the headline
// figures computed from those rows, copied here rather than fetched
// so the marketing pages stay static. Copied 2026-11-07, from Homepage
// main at bb1ec15. If the Homepage data changes, recompute and
// update these together.
//
// Who the figures describe: 121 Studyworks Prep students. 21 were
// tracked on this platform; the other 100 come from one-on-one
// tutoring records from before platform tracking. Copy that cites
// these numbers should say "Studyworks students", not imply that
// everyone used the app on their own.

export const resultsPageUrl = 'https://www.studyworksprep.com/results';

export const satResults = {
  students: 121,
  platformStudents: 21,
  // Medians ("typical gain"), in points.
  medianGain: 230,
  medianMathGain: 140,
  medianReadingWritingGain: 90,
  // Shares of all students, 0–1.
  improvedShare: 1,
  gained200Share: 0.62,
} as const;

const percent = new Intl.NumberFormat('en-US', { style: 'percent' });

export type ResultsStat = { value: string; label: string };

// The same four headline stats, with the same labels, as the
// Homepage home page's "The Numbers Speak" section.
export const headlineResultsStats: ResultsStat[] = [
  { value: `+${satResults.medianGain}`, label: 'Typical SAT point gain' },
  { value: percent.format(satResults.improvedShare), label: 'Raised their SAT score' },
  { value: percent.format(satResults.gained200Share), label: 'Gained 200+ points' },
  { value: String(satResults.students), label: 'Students in our results' },
];

export const resultsSourceNote =
  `Results from ${satResults.students} Studyworks students: ` +
  `${satResults.platformStudents} tracked on this platform and ` +
  `${satResults.students - satResults.platformStudents} from our one-on-one tutoring records. ` +
  'Typical gain is the median.';
