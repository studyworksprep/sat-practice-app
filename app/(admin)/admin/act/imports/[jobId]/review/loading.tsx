import s from './Review.module.css';

export default function ReviewLoading() {
  return <main className={s.container}><p role="status">Loading draft review…</p></main>;
}
