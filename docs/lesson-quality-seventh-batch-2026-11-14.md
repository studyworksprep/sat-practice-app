# Seventh optional lesson-quality batch — real-bank strategy examples

> **Status: Historical.** Completed November 14, 2026.

Two real-bank examples were added to the requested live lessons. Each addition has a worked strategy decision followed by a retry question. Both existing strategies and every original card's content are unchanged. Other optional recommendations remain unapplied.

| Lesson | New cards | Example and decision |
| --- | --- | --- |
| [Solve Subject–Verb Agreement with the Odd-One-Out Trick](https://studyworks.io/tutor/lessons/21d20a69-dbbd-4aac-bafb-ae7a459c0da7/preview) | 31–32, after `tense_trap_check`; 38 → 40 cards | **RW-00510**, Bonnie Buratti's discovery. “Will study” fits both “he” and “they,” so the existing eligibility gate rules out Odd-One-Out. The next card uses “when she made” to select past-progressive **D, was studying**. |
| [Rhetorical Synthesis: Let the Goal Lead](https://studyworks.io/tutor/lessons/1ba468c9-9ddf-4c95-8ff3-df731e88788f/preview) | 20–21, after `fact_check_example_check`; 26 → 28 cards | **RW-00372**, bird extinction risks. The goal retains A and B because both compare the requested risks; C makes no comparison and D discusses one species. The next card checks the notes: C. olivacea faces high risk and C. furcatus little risk, making **A** accurate and B a reversal. |

The full bank question appears on each worked decision card. Its stimulus or notes remain beside the retry question, which retains the bank's task, choice order, and key. The first card models choosing the method without announcing the factual answer to the following check. The checks have targeted retry hints and worked solutions.

Source questions were freshly verified: RW-00510 is `d65b49ab-20db-4d40-bf81-7e8a34415f9d`; RW-00372 is `d22e2993-85b0-4644-a926-399ee31b6d9d`. These are inline lesson copies, not invented or dynamically linked question IDs. Display-only cleanup decodes escaped markup, normalizes whitespace, removes a redundant screen-reader blank label while retaining the visible blank, and converts answer-button HTML to plain text without adding spaces before punctuation. The bank records themselves are unchanged.

## Verification

- Both updated specifications compile and pass the lesson validator with **zero errors and warnings**. Their compiled content exactly matches the saved live blocks. Bank text, option order, and keys were compared with the new questions.
- Instructional review confirms that the agreement example applies the lesson's existing exclusivity gate, then uses the sentence's time relationship. The synthesis example applies the existing goal-first filter, then checks only the notes needed to distinguish the two surviving comparisons. The existing procedures, other examples, opening-and-return work, independent practice, and endings are unchanged.
- Pacing and retrieval lint warnings are pre-existing and unchanged: Subject–Verb Agreement has text cards 1–3, checks 26–28, and a retrieval-distractor heuristic on `final_eligibility_check`; Rhetorical Synthesis has text runs 1–3 and 16–18. The final eligibility item applies the gate to an answer set rather than merely recalling process vocabulary. These warnings do not require changes to this scoped addition.
- Every slide was visited at **1440-pixel desktop** and **390-pixel mobile** widths: 68 slides at each width, **136 unique captures**. The four added cards were visually inspected at both widths; the updated synthesis check was revisited after punctuation cleanup. No page-width overflow, literal HTML, or unloaded images was detected. A normal mobile viewport also confirmed that feedback and navigation remain readable while scrolling. Full-page captures can show the fixed mobile header mid-image; this is a capture artifact. Tutor preview displays answers and feedback and records no student responses. The temporary viewport override was reset.
- The complete bank comparison confirms **44 untouched lesson records**. All **1,522 original block IDs and content objects** remain intact, including all **730 existing check and Desmos-interactive content objects**. Fifteen later sort positions shift to accommodate the four inserted blocks; original relative order is preserved. The bank now contains **1,526 blocks**, including two additional retry checks.
- Both source question records, student progress (49 rows), topics, techniques, assignments, curriculum placement, titles, descriptions, publication status, and visibility are unchanged. Their fingerprints were checked after the previews. No student responses were edited.

## Source and recovery

Updated importable specifications are in `content/lesson-repairs/2026-11-14-quality-seventh-batch/after-specs/`:

- `subject-verb-agreement-odd-one-out.json`
- `rhetorical-synthesis-goal-first.json`

Exact previous live specifications are archived under `docs/lesson-template-specs/archive/quality-seventh-batch-2026-11-14/`. The [batch source branch](https://github.com/studyworksprep/sat-practice-app/tree/codex/lesson-quality-seventh-batch-20261114-bf5d) preserves the two updated specifications, their archives, and this record. The user explicitly approved this GitHub source backup after the live lesson updates were complete. These saved-content changes require no application deployment. Full bank snapshots, source-question snapshots, progress fingerprints, and preview screenshots remain local and are excluded from the five-file source backup.

The original checkout contains separate local drafts of both lessons. Those files were preserved byte-for-byte; updated live versions are in the local review bundle and source branch. No unrelated local work was overwritten.

Authoring used connector-verified current remote main, `b59469832c9ed124acfb3bbfccd82084c25e2184`. Fetching was limited by unavailable DNS, and that commit was not available locally. The connector enumerated the lesson directory and fetched both target specifications and the three randomly selected models at that exact current-main commit; each file's Git blob hash matched the local copy. The current-main commit changes billing, roster, and access-policy files, with no changes to lesson authoring guides, template import, validation, or slideshow rendering. Validation therefore ran with the identical lesson tooling from its immediate parent, `5431c64e3809d7486d0637c246f373b1f5b11de7`, in a separate checkout. The source branch uses the verified current-main tree as its baseline. Each baseline specification was compiled and compared with the fresh live bank before editing.

Three model specifications were selected randomly and read at current main:

- `docs/lesson-template-specs/cross-text-connections-keep-the-voices-straight.json`
- `docs/lesson-template-specs/inference-minimum-supported-conclusion.json`
- `docs/lesson-template-specs/probability-from-tables-favorable-over-total.json`

The local recovery bundle is `content/lesson-repairs/2026-11-14-quality-seventh-batch/`: before/after snapshots, guarded SQL, source guards, exact previous and updated specifications, item review, validator/lint reports, preview captures, preservation verification, and publication record. The initial save locked and checked both target lessons and the source question hashes before inserting four blocks and shifting only the intended sort positions. A subsequent conditional update corrected punctuation spacing in the one newly added synthesis check; all original cards remained unchanged.
