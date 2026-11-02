import Link from 'next/link';
import s from './TestTypeSwitcher.module.css';

type TestType = 'sat' | 'act';
type Props = { value: TestType; className?: string } & (
  | { hrefs: Record<TestType, string>; onChange?: never; name?: never }
  | { hrefs?: never; onChange: (value: TestType) => void; name: string }
);
const TESTS = ['sat', 'act'] as const;

/** Links on server-rendered student pages; native radios in the tutor form. */
export function TestTypeSwitcher(props: Props) {
  const options = TESTS.map(test => {
    const active = props.value === test;
    const className = `${s.option} ${active ? s.active : ''}`;
    const content = <><span className={s.check} aria-hidden="true">✓</span><span>{test.toUpperCase()}</span></>;
    return props.hrefs ? (
      <Link key={test} href={props.hrefs[test]} className={className} aria-current={active ? 'page' : undefined}>
        {content}
      </Link>
    ) : (
      <label key={test} className={className}>
        <input type="radio" name={props.name} value={test} checked={active}
          onChange={() => props.onChange(test)} className={s.visuallyHidden} />
        {content}
      </label>
    );
  });
  return (
    <div className={`${s.switcher} ${props.className ?? ''}`}>
      <span className={s.label}>Choose a test</span>
      {props.hrefs ? <nav className={s.options} aria-label="Test type">{options}</nav> : (
        <fieldset className={s.options}>
          <legend className={s.visuallyHidden}>Test type</legend>
          {options}
        </fieldset>
      )}
    </div>
  );
}
