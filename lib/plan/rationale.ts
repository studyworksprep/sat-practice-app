/** Refresh only the generator's standard score sentence for display. The
 * stored rationale and any custom tutor wording remain untouched. */
export function currentPlanRationale(rationale: string | null, goalScore: number | null): string | null {
  if (!rationale) return rationale;
  return rationale.replace(/^(\d+-week plan)(?: from (\d+))? toward \d+\./,
    (_match, plan: string, starting: string | undefined) => goalScore == null
      ? `${plan}.`
      : `${plan}${starting ? ` from ${starting}` : ''} toward ${goalScore}.`);
}
