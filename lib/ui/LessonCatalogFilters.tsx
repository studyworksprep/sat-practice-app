import Link from 'next/link';
import type { LessonCatalogFacets, LessonCatalogFilters } from '@/lib/lesson/catalog';
import styles from './LessonCatalogFilters.module.css';

interface Props {
  action: string;
  filters: LessonCatalogFilters;
  facets: LessonCatalogFacets;
  showStatus?: boolean;
  showCategorization?: boolean;
}

export function LessonCatalogFilterBar({
  action,
  filters,
  facets,
  showStatus = false,
  showCategorization = false,
}: Props) {
  return (
    <form action={action} method="get" className={styles.form} aria-label="Filter lessons">
      <label className={`${styles.field} ${styles.searchField}`}>
        <span>Search</span>
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ''}
          placeholder="Title, description, skill, or pattern"
        />
      </label>

      <FilterSelect label="Section" name="section" value={filters.section}>
        <option value="">All sections</option>
        {facets.sections.map((section) => (
          <option key={section.value} value={section.value}>{section.label}</option>
        ))}
      </FilterSelect>

      <FilterSelect label="Domain" name="domain" value={filters.domain}>
        <option value="">All domains</option>
        {facets.domains.map((domain) => (
          <option key={domain} value={domain}>{domain}</option>
        ))}
      </FilterSelect>

      <FilterSelect label="Type" name="kind" value={filters.kind}>
        <option value="">All types</option>
        {facets.kinds.map((kind) => (
          <option key={kind} value={kind}>{labelValue(kind)}</option>
        ))}
      </FilterSelect>

      {showStatus && (
        <FilterSelect label="Status" name="status" value={filters.status}>
          <option value="">All statuses</option>
          {facets.statuses.map((status) => (
            <option key={status} value={status}>{labelValue(status)}</option>
          ))}
        </FilterSelect>
      )}

      {showCategorization && (
        <FilterSelect
          label="Curriculum tags"
          name="categorization"
          value={filters.categorization}
        >
          <option value="all">All lessons</option>
          <option value="categorized">Categorized</option>
          <option value="uncategorized">Uncategorized</option>
        </FilterSelect>
      )}

      <FilterSelect label="Sort" name="sort" value={filters.sort ?? 'updated'}>
        <option value="updated">Recently updated</option>
        <option value="title">Title A–Z</option>
        <option value="curriculum">Curriculum order</option>
      </FilterSelect>

      <div className={styles.actions}>
        <button type="submit">Apply filters</button>
        <Link href={action}>Clear</Link>
      </div>
    </form>
  );
}

function FilterSelect({
  label,
  name,
  value,
  children,
}: {
  label: string;
  name: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select name={name} defaultValue={value ?? ''}>{children}</select>
    </label>
  );
}

function labelValue(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
