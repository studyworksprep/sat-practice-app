// Canonical SAT Reading & Writing + Math taxonomy (digital SAT,
// 2024+ blueprint). Hard-coded because the College Board updates
// this on a multi-year cadence; mirrored from the distinct
// (domain_code, skill_code) tuples in questions_v2.
//
// Used by:
//   - the student-notes editor's Domain / Skill <select>s, so
//     the student picks from the same list the question bank uses
//   - any future surface that needs a label-from-code lookup
//     without a DB round-trip (e.g. a stats page).
//
// If College Board renames a domain or skill, regenerate the table
// inside this file from:
//   select case when domain_code in ('CAS','EOI','INI','SEC')
//              then 'rw' else 'math' end as subject_code,
//          domain_code, domain_name, skill_code, skill_name
//     from public.questions_v2
//    where domain_code is not null and skill_code is not null
//    group by 1,2,3,4,5
//    order by 1,2,4;

export type SatSubjectCode = 'rw' | 'math';

export interface SatSkill {
  code: string;
  name: string;
}

export interface SatDomain {
  subjectCode: SatSubjectCode;
  code: string;
  name: string;
  skills: SatSkill[];
}

export const SAT_TAXONOMY: SatDomain[] = [
  {
    subjectCode: 'math',
    code: 'H',
    name: 'Algebra',
    skills: [
      { code: 'H.A.', name: 'Linear equations in one variable' },
      { code: 'H.B.', name: 'Linear functions' },
      { code: 'H.C.', name: 'Linear equations in two variables' },
      { code: 'H.D.', name: 'Systems of two linear equations in two variables' },
      { code: 'H.E.', name: 'Linear inequalities in one or two variables' },
    ],
  },
  {
    subjectCode: 'math',
    code: 'P',
    name: 'Advanced Math',
    skills: [
      { code: 'P.A.', name: 'Equivalent expressions' },
      { code: 'P.B.', name: 'Nonlinear equations in one variable and systems of equations in two variables' },
      { code: 'P.C.', name: 'Nonlinear functions' },
    ],
  },
  {
    subjectCode: 'math',
    code: 'Q',
    name: 'Problem-Solving and Data Analysis',
    skills: [
      { code: 'Q.A.', name: 'Ratios, rates, proportional relationships, and units' },
      { code: 'Q.B.', name: 'Percentages' },
      { code: 'Q.C.', name: 'One-variable data: Distributions and measures of center and spread' },
      { code: 'Q.D.', name: 'Two-variable data: Models and scatterplots' },
      { code: 'Q.E.', name: 'Probability and conditional probability' },
      { code: 'Q.F.', name: 'Inference from sample statistics and margin of error' },
      { code: 'Q.G.', name: 'Evaluating statistical claims: Observational studies and experiments' },
    ],
  },
  {
    subjectCode: 'math',
    code: 'S',
    name: 'Geometry and Trigonometry',
    skills: [
      { code: 'S.A.', name: 'Area and volume' },
      { code: 'S.B.', name: 'Lines, angles, and triangles' },
      { code: 'S.C.', name: 'Right triangles and trigonometry' },
      { code: 'S.D.', name: 'Circles' },
    ],
  },
  {
    subjectCode: 'rw',
    code: 'INI',
    name: 'Information and Ideas',
    skills: [
      { code: 'CID', name: 'Central Ideas and Details' },
      { code: 'COE', name: 'Command of Evidence' },
      { code: 'INF', name: 'Inferences' },
    ],
  },
  {
    subjectCode: 'rw',
    code: 'CAS',
    name: 'Craft and Structure',
    skills: [
      { code: 'WIC', name: 'Words in Context' },
      { code: 'TSP', name: 'Text Structure and Purpose' },
      { code: 'CTC', name: 'Cross-Text Connections' },
    ],
  },
  {
    subjectCode: 'rw',
    code: 'EOI',
    name: 'Expression of Ideas',
    skills: [
      { code: 'SYN', name: 'Rhetorical Synthesis' },
      { code: 'TRA', name: 'Transitions' },
    ],
  },
  {
    subjectCode: 'rw',
    code: 'SEC',
    name: 'Standard English Conventions',
    skills: [
      { code: 'BOU', name: 'Boundaries' },
      { code: 'FSS', name: 'Form, Structure, and Sense' },
    ],
  },
];

const DOMAIN_BY_CODE = new Map(SAT_TAXONOMY.map((d) => [d.code, d]));

export function findDomain(code: string | null | undefined): SatDomain | null {
  if (!code) return null;
  return DOMAIN_BY_CODE.get(code) ?? null;
}

export function findSkill(
  domainCode: string | null | undefined,
  skillCode: string | null | undefined,
): SatSkill | null {
  if (!skillCode) return null;
  const domain = findDomain(domainCode);
  if (!domain) return null;
  return domain.skills.find((s) => s.code === skillCode) ?? null;
}

export function domainsForSubject(
  subjectCode: SatSubjectCode | string | null | undefined,
): SatDomain[] {
  if (subjectCode !== 'rw' && subjectCode !== 'math') return SAT_TAXONOMY;
  return SAT_TAXONOMY.filter((d) => d.subjectCode === subjectCode);
}
