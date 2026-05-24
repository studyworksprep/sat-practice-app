// Flashcards — landing page. Lists the user's sets with per-set
// counts + average mastery, plus a "+ New set" form. Lives under
// /notes since flashcards are one of the three "kinds of notes"
// the student keeps. The per-set routes (/flashcards/[setId] and
// /flashcards/[setId]/review) stay where they are so existing
// bookmarks survive; the bare /flashcards landing redirects here.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { LayersIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import { ensureDefaultSets } from '@/lib/practice/flashcards-helpers';
import { NotesNav } from '../NotesNav';
import { HelpButton } from '../../help/HelpButton';
import { CreateSetForm } from './CreateSetForm';
import s from './Flashcards.module.css';
import notesS from '../Notes.module.css';

export const dynamic = 'force-dynamic';

export default async function FlashcardsLandingPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'practice') redirect('/subscribe');

  await ensureDefaultSets(supabase, user.id);

  // Pull sets + every card's set_id+mastery in two reads. Counts
  // and per-set mastery averages are computed in memory — there
  // are at most a couple hundred cards in a typical user library,
  // so a single IN query is cheaper than a per-set rollup.
  const { data: sets } = await supabase
    .from('flashcard_sets')
    .select('id, name, is_default, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  const setIds = (sets ?? []).map((s2) => s2.id);
  const { data: cards } = setIds.length > 0
    ? await supabase
        .from('flashcards')
        .select('set_id, mastery')
        .in('set_id', setIds)
    : { data: [] };

  const counts = new Map();
  const masterySums = new Map();
  for (const c of cards ?? []) {
    counts.set(c.set_id, (counts.get(c.set_id) ?? 0) + 1);
    masterySums.set(c.set_id, (masterySums.get(c.set_id) ?? 0) + (c.mastery ?? 0));
  }

  const enrichedSets = (sets ?? []).map((set) => {
    const count = counts.get(set.id) ?? 0;
    const sum = masterySums.get(set.id) ?? 0;
    const avgMasteryPct = count > 0 ? Math.round((sum / (count * 5)) * 100) : null;
    return { ...set, cardCount: count, avgMasteryPct };
  });

  const totalCards = (cards ?? []).length;

  return (
    <main className={notesS.page}>
      <NotesNav />
      <header className={s.header}>
        <div className={s.titleRow}>
          <IconTile icon={LayersIcon} palette="violet" size="md" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 className={s.h1}>Flashcards</h1>
              <HelpButton slug="flashcards" />
            </div>
            <p className={s.sub}>
              Your private terms + vocabulary library. Pick a set
              to manage cards or start a review session — the
              review picker weighs lower-mastery cards higher so
              the ones you don&apos;t know come up more often.
            </p>
          </div>
        </div>
      </header>

      {totalCards > 0 && (
        <div className={s.statsStrip}>
          <Stat label="Sets" value={enrichedSets.length} />
          <Stat label="Total cards" value={totalCards} />
        </div>
      )}

      <section className={s.setsSection}>
        <div className={s.setsHead}>
          <span className={s.sectionLabel}>Your sets</span>
        </div>

        {enrichedSets.length === 0 ? (
          <div className={s.emptyCard}>
            <h2 className={s.emptyH2}>No sets yet.</h2>
            <p className={s.emptyBody}>
              Create your first set below to start collecting
              flashcards.
            </p>
          </div>
        ) : (
          <ul className={s.setList}>
            {enrichedSets.map((set) => (
              <li key={set.id} className={s.setRow}>
                <div className={s.setMain}>
                  <div className={s.setNameRow}>
                    <Link href={`/flashcards/${set.id}`} className={s.setName}>
                      {set.name}
                    </Link>
                    {set.is_default && (
                      <span className={s.setBadge}>Default</span>
                    )}
                  </div>
                  <div className={s.setMeta}>
                    {set.cardCount} card{set.cardCount === 1 ? '' : 's'}
                    {set.avgMasteryPct != null && (
                      <>
                        <span className={s.setDot}>·</span>
                        <span className={masteryClass(set.avgMasteryPct, s)}>
                          {set.avgMasteryPct}% mastery
                        </span>
                      </>
                    )}
                  </div>
                  {set.cardCount > 0 && (
                    <div className={s.setBar}>
                      <div
                        className={s.setBarFill}
                        style={{ width: `${set.avgMasteryPct ?? 0}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className={s.setActions}>
                  <Link
                    href={`/flashcards/${set.id}`}
                    className={s.setBtnSecondary}
                  >
                    Manage
                  </Link>
                  {set.cardCount > 0 && (
                    <Link
                      href={`/flashcards/${set.id}/review`}
                      className={s.setBtnPrimary}
                    >
                      Review →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={s.createCard}>
        <div className={s.sectionLabel}>Create a new set</div>
        <CreateSetForm />
      </section>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function Stat({ label, value }) {
  return (
    <div className={s.statTile}>
      <div className={s.statValue}>{value.toLocaleString()}</div>
      <div className={s.statLabel}>{label}</div>
    </div>
  );
}

function masteryClass(pct, s) {
  if (pct >= 80) return s.masteryGood;
  if (pct >= 50) return s.masteryOk;
  return s.masteryLow;
}
