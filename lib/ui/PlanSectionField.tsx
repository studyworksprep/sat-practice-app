import { isSectionFocus, SECTION_LABELS, type SectionFocus } from '../plan/section-focus';

export function PlanSectionField({ styles, defaultValue = 'both', onChange }: {
  styles: Record<string, string>;
  defaultValue?: SectionFocus;
  onChange?: (focus: SectionFocus) => void;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>SAT sections to study</span>
      <select className={styles.input} name="sectionFocus" defaultValue={defaultValue}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (onChange && isSectionFocus(value)) onChange(value);
        }}>
        {Object.entries(SECTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  );
}
