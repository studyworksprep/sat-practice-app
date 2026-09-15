export type ImportSection = 'M' | 'RW';
const domains: Record<string, ImportSection> = {
  Algebra:'M', 'Advanced Math':'M', 'Problem-Solving and Data Analysis':'M', 'Geometry and Trigonometry':'M',
  'Information and Ideas':'RW', 'Craft and Structure':'RW', 'Expression of Ideas':'RW', 'Standard English Conventions':'RW',
};
export function sectionFromDomain(domain: string | null | undefined): ImportSection | null {
  return domains[domain ?? ''] ?? null;
}
