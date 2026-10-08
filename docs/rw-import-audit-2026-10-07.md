# Reading and Writing September import audit

**Historical** — audit completed October 7, 2026; production repairs completed and verified October 8, 2026.

The September 22 import contains **175 published Reading and Writing questions, RW-01688 through RW-01864** (RW-01784 and RW-01785 are not present). All 175 matched their College Board metadata and official API records, and all 175 answer keys agree. **All 131 identified questions have been corrected in the live bank**: 94 had a defect in the passage, prompt, or choices; 37 had defects confined to the explanation. The other 44 questions were left unchanged, including two acceptable chart layouts and 42 that matched after normalization of quote style, spaces, and equivalent rendered mathematical notation.

## Completed repairs

The user authorized publication on October 8. The repairs restored 236 affected fields from the verified College Board responses, including all 11 referenced underlines, the two complete chart legends, italics, passage labels, completion markers, punctuation, and OCR substitutions. Only the reviewed fields were replaced. Genuine compound-word hyphens and the source punctuation in every affected distractor were retained. The two chart figures use the exact original SVG data embedded as images so their legend markers survive sanitization. Scientific notation continues through the shared math renderer, including squared units, strontium isotopes, and phosphine.

Each update checked the current content, metadata, update time, and absence of conflicting drafts before writing. All 131 saved rows match their prepared repairs and the official wording and formatting. Question IDs, grading keys, choice identities and order, taxonomy, hints, and publication status were preserved. All 17 existing student attempts and all practice-test associations remained unchanged. The other 44 cohort rows are identical to their pre-repair versions.

All 131 prior published versions were verified in content history, and each question has a promoted content draft recording the official external ID, source response hash, and repair authorization. All 131 repaired pages passed browser checks with four choices, loaded images, visible underlines, and no overflow or math errors. Chart legends, underlines, punctuation choices, and scientific notation also received visual checks. The local before/after pages were regenerated from the actual saved production rows. TypeScript validation passed.

- All 131 rendered before/after repairs (local audit artifact)
- [Saved-content and recovery verification](../content/question-repairs/2026-10/verification.json)
- [Corrected question content](../content/question-repairs/2026-10/reading-writing.json)
- Full pre-repair production snapshot (local audit artifact)
- [Rendered repair checks](../content/question-repairs/2026-10/reading-writing-browser-checks.json)

The findings and correction list below describe the original import defects, all now repaired.

## Findings

| Issue | Questions | Significance |
|---|---:|---|
| Missing underlines | 11 | The student cannot see the referenced word, phrase, or sentence. |
| Lost italics | 51 | Titles, scientific names, foreign words, and emphasis lost their formatting. |
| Altered em dashes | 109 | 294 source em dashes became hyphens: 87 in student content and 207 in explanations. |
| Altered grammar answer choices | 5 | Em dashes in punctuation answers became hyphens. |
| Missing chart legend markers | 2 | Gray and black series can no longer be identified reliably. |
| Missing answer blank | 1 | RW-01710 ends without the visible completion marker. |
| Missing period or comma beside a blank | 2 | RW-01762 lost a period; RW-01764 lost a comma. |
| Lost bold passage labels | 3 | Text 1 and Text 2 lose visual separation. |

Categories overlap. There are also five OCR substitutions in names or a title, six questions with lost word hyphens, three explanations with quotation or possessive apostrophe errors, a stray underscore, and one merged attribution/passage paragraph. Six questions use hyphens where the source uses en dashes; these are lower-priority typography corrections.

The 22 high-priority questions covered the missing underlines, altered grammar choices, chart legends, missing blank, missing punctuation beside blanks, and corrupted Richard II title. These and all remaining typography and explanation issues are repaired.

## Referenced underlines

| Question | College Board ID | Beginning of the referenced content |
|---|---|---|
| RW-01699 | 3a489e1e | As the movement spread beyond Chile, the breadth of musical traditions incorporated into its foun… |
| RW-01703 | 8e22efd9 | Moreover, the LCOE differential grew from 18.8% to 31.3% when the modeled cell lifetime was reduc… |
| RW-01719 | 10455a19 | Since it was first introduced, Baxandall's period eye has significantly influenced the practice o… |
| RW-01747 | 153aaae2 | a period coinciding with extremely arid conditions and slightly negative population growth |
| RW-01756 | 2ec0e43e | What if India had started the Industrial Revolution? What if Soviet cosmonauts had been first to … |
| RW-01758 | 6557f7fc | reserve |
| RW-01761 | c762ca58 | When considering automation, therefore, companies—especially those specializing in products of sy… |
| RW-01763 | 271a5017 | Bitter's feet were singing the news. |
| RW-01765 | dbb56a02 | People tend to assume that being happy is the ideal emotional state and should be an ongoing aspi… |
| RW-01771 | de059199 | adopting such a regimen would run counter to the ecological promise of the pellicle approach. |
| RW-01773 | 3bd32343 | consideration |

## Content and chart corrections

| Question | Required correction |
|---|---|
| RW-01688 | Restore chart legend swatches; remove literal code fences. |
| RW-01700 | Correct the OCR character in Altınışık. |
| RW-01710 | Restore the missing answer blank at the end of the passage. |
| RW-01720 | Restore Richard II in the stem; II became //. |
| RW-01721 | Restore chart legend swatches; both series currently use identical empty-square markers. |
| RW-01722 | Restore hyphens in neutral-pitched and mid-range. |
| RW-01735 | Restore hataałii; ł became t. |
| RW-01738 | Restore the hyphen in brain-to-body in the explanation. |
| RW-01744 | Restore the hyphen in Earth-based in the explanation. |
| RW-01761 | Replace the stray underscore in efficiency_gains with a space. |
| RW-01762 | Restore the period after the answer blank. |
| RW-01764 | Restore the comma after the answer blank. |
| RW-01773 | Separate the introductory attribution from the quoted passage. |
| RW-01783 | Restore Iowa; capital I became lowercase l. |
| RW-01788 | Restore the hyphens in proto-language. |
| RW-01791 | Restore the hyphen in art-based in the explanation. |
| RW-01793 | Restore the hyphen in by-product in choice B. |
| RW-01808 | Restore Iestyn; capital I became lowercase l. |
| RW-01836 | Restore misplaced or omitted closing single quotation marks around EGOT in the explanation. |
| RW-01851 | Restore the placement of the closing single quotation mark around chinampas in the explanation. |
| RW-01864 | Restore the possessive apostrophe after towns in the explanation. |

The punctuation-answer corrections are RW-01835 choice C, RW-01836 choice C, RW-01849 choice B, RW-01850 choice C, and RW-01861 choice D. Preserve every choice and its order; restore the source punctuation in distractors as well as correct answers.

## Preserved formatting and acceptable differences

Superscripts and subscripts survive through the shared math renderer, including strontium isotopes, phosphine, squared units, and the area choices. They do not need repair. The three data tables retain their cells and values. The poem in RW-01718 retains all eight line breaks. Bullet lists retain all notes and their order. No stale rendered-cache text or math-rendering errors were found.

Incidental spacing after the rendered squared unit in RW-01858 is equivalent to the source and can be retained.

RW-01704 has a complete chart and a separate legend, with the title in prose above them. RW-01709 has a complete chart and legend, with its title above the image. These layouts contain all required information and can be retained. They are excluded from the 131-question correction list.

## Repair approach

Use the API HTML as the source for affected passages, prompts, choices, and explanations, matching each question by its verified external ID. Preserve question IDs, taxonomy, choice labels and order, and grading keys. Normalize the source through the app sanitizer and shared renderer, retaining underlines, italics, paragraph boundaries, and complete chart legends. Rebuild affected rendered caches and save the previous content before publishing. Avoid global hyphen replacement: the source contains both genuine compound-word hyphens and intentional punctuation in incorrect answers.

For future College Board imports, prefer the official structured HTML when an external ID is available. Use Mathpix for sources that require OCR, then compare parsed content against the API before publication. A publication check should flag missing referenced underlines, missing completion blanks, altered answer-choice punctuation, lost semantic formatting, and incomplete figure legends.

The endpoint is the Educator Question Bank website's internal API, not a documented developer contract. The verified request is `POST https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital/get-question` with `{"external_id":"<verified source_external_id>"}`. Cache the verified raw responses and source hashes so repairs remain reviewable if the endpoint changes.

## Verification and records

The cohort was selected by creation dates from September 1 through October 7, then checked against recent updates and high RW display codes. All 175 were created September 22 and use the admin_import source. Eighty older Reading and Writing questions updated September 15 were excluded because those updates did not represent new imports. RW-01718 and RW-01748 had later edits and are included.

Each source_external_id matched exactly one entry in the local September 22 metadata. All API response external IDs, A–D choice positions, correct-answer labels, and correct-answer option UUIDs agreed. Normalized text comparisons ignore smart-versus-straight quote shape, nonbreaking spaces, blank-line length, equivalent mathematical glyphs, and slash spacing; they retain em-dash/en-dash/hyphen distinctions, apostrophe omissions, accents, and substantive punctuation. Visual source figures were compared in all four chart questions.

All 175 original audit comparison pages passed browser checks for four choices on each side, loaded figures, page width, italic styling, and referenced underlines. The underlines and chart legends were also inspected visually. These historical local previews use the app's shared QuestionRenderer and prose styles; they show the pre-repair content versus the official reference. TypeScript validation passed.

- Complete findings and counts (local audit artifact)
- 131 question repair review with exact official fields (local audit artifact) — a review artifact, not a ready-to-execute database update.
- All 175 historical audit comparisons (local audit artifact)
- Original audit snapshot (local audit artifact)
- [Official API response manifest and hashes](../content/question-repairs/2026-10/source-manifests.json)
- Browser verification (local audit artifact)

## Full correction list

| Question | Priority | Affected fields | Corrections |
|---|---|---|---|
| RW-01688 | High | stimulus, rationale | Restore italics. Restore official em dashes. Restore chart legend swatches; remove literal code fences. |
| RW-01690 | Normal | stimulus, rationale | Restore official em dashes. |
| RW-01692 | Normal | stimulus | Restore official em dashes. |
| RW-01693 | Normal | rationale | Restore official em dashes. |
| RW-01695 | Normal | stimulus, rationale | Restore official em dashes. |
| RW-01696 | Normal | rationale | Restore official em dashes. |
| RW-01697 | Normal | rationale | Restore italics. Restore official em dashes. |
| RW-01699 | High | stimulus, stem, rationale, option-B, option-C | Restore referenced underline. Restore italics. Restore official em dashes. |
| RW-01700 | Normal | stimulus | Restore official em dashes. Correct the OCR character in Altınışık. |
| RW-01701 | Normal | stimulus, rationale | Restore italics. Restore official em dashes. |
| RW-01702 | Normal | rationale | Restore italics. Restore official em dashes. |
| RW-01703 | High | stimulus, rationale | Restore referenced underline. Restore official em dashes. |
| RW-01705 | Normal | rationale | Restore official em dashes. |
| RW-01706 | Normal | stimulus | Restore official em dashes. |
| RW-01707 | Normal | rationale | Restore official em dashes. |
| RW-01708 | Normal | stimulus | Restore official em dashes. |
| RW-01710 | High | stimulus, rationale | Restore official em dashes. Restore the missing answer blank at the end of the passage. |
| RW-01713 | Normal | stimulus, rationale | Restore italics. Restore official em dashes. |
| RW-01714 | Normal | stimulus, rationale | Restore italics. Restore official em dashes. |
| RW-01715 | Normal | stimulus | Restore official em dashes. |
| RW-01716 | Normal | stimulus, rationale | Restore official em dashes. |
| RW-01717 | Normal | stimulus, rationale | Restore official em dashes. |
| RW-01718 | Normal | stimulus, rationale | Restore italics. Restore official em dashes. |
| RW-01719 | High | stimulus, rationale | Restore referenced underline. Restore official em dashes. |
| RW-01720 | High | stimulus, stem, rationale, option-A | Restore italics. Restore official em dashes. Restore Richard II in the stem; II became //. |
| RW-01721 | High | stimulus, rationale | Restore official em dashes. Restore chart legend swatches; both series currently use identical empty-square markers. |
| RW-01722 | Normal | stimulus, rationale | Restore hyphens in neutral-pitched and mid-range. |
| RW-01723 | Normal | stimulus, rationale | Restore italics. Restore official em dashes. |
| RW-01724 | Normal | rationale | Restore official em dashes. |
| RW-01725 | Normal | stimulus, rationale, option-A | Restore italics. Restore official em dashes. |
| RW-01726 | Normal | rationale | Restore official em dashes. |
| RW-01727 | Normal | rationale | Restore official em dashes. |
| RW-01728 | Normal | rationale | Restore official em dashes. |
| RW-01729 | Normal | rationale | Restore official em dashes. |
| RW-01730 | Normal | stimulus, rationale, option-A, option-B, option-C, option-D | Restore italics. Restore official em dashes. |
| RW-01731 | Normal | rationale | Restore official em dashes. |
| RW-01732 | Normal | rationale | Restore official em dashes. |
| RW-01733 | Normal | stimulus, rationale | Restore official em dashes. |
| RW-01734 | Normal | stimulus, rationale, option-A, option-D | Restore italics. Restore official em dashes. |
| RW-01735 | Normal | stimulus, rationale, option-A, option-B, option-C, option-D | Restore italics. Restore official em dashes. Restore hataałii; ł became t. |
| RW-01736 | Normal | stimulus, rationale | Restore italics. Restore official em dashes. |
| RW-01737 | Normal | stimulus, rationale | Restore official em dashes. Restore official en dashes. |
| RW-01738 | Normal | rationale | Restore official em dashes. Restore the hyphen in brain-to-body in the explanation. |
| RW-01739 | Normal | rationale | Restore official em dashes. |
| RW-01740 | Normal | stimulus, stem, rationale, option-A, option-B, option-C, option-D | Restore italics. Restore official em dashes. |
| RW-01741 | Normal | rationale | Restore official em dashes. |
| RW-01742 | Normal | stimulus, rationale | Restore italics. |
| RW-01743 | Normal | stimulus, rationale, option-A, option-B, option-D | Restore bold Text 1 and Text 2 labels. Restore official em dashes. |
| RW-01744 | Normal | rationale | Restore italics. Restore the hyphen in Earth-based in the explanation. |
| RW-01745 | Normal | rationale | Restore official em dashes. |
| RW-01747 | High | stimulus | Restore referenced underline. |
| RW-01749 | Normal | rationale | Restore official em dashes. |
| RW-01750 | Normal | rationale | Restore official em dashes. |
| RW-01751 | Normal | stimulus | Restore official em dashes. |
| RW-01753 | Normal | rationale | Restore italics. |
| RW-01756 | High | stimulus, rationale | Restore referenced underline. Restore official em dashes. |
| RW-01757 | Normal | stimulus, rationale | Restore italics. Restore official em dashes. |
| RW-01758 | High | stimulus, rationale | Restore referenced underline. Restore italics. Restore official em dashes. |
| RW-01759 | Normal | rationale | Restore official em dashes. |
| RW-01761 | High | stimulus, rationale | Restore referenced underline. Restore official em dashes. Replace the stray underscore in efficiency_gains with a space. |
| RW-01762 | High | stimulus, rationale | Restore official em dashes. Restore the period after the answer blank. |
| RW-01763 | High | stimulus | Restore referenced underline. Restore italics. Restore official em dashes. |
| RW-01764 | High | stimulus, rationale | Restore italics. Restore official em dashes. Restore the comma after the answer blank. |
| RW-01765 | High | stimulus | Restore referenced underline. Restore official em dashes. |
| RW-01766 | Normal | stimulus, rationale | Restore official em dashes. |
| RW-01768 | Normal | stimulus, rationale | Restore italics. Restore official em dashes. |
| RW-01769 | Normal | stimulus, rationale | Restore italics. Restore official em dashes. |
| RW-01770 | Normal | rationale | Restore official em dashes. |
| RW-01771 | High | stimulus, rationale | Restore referenced underline. Restore italics. Restore official em dashes. |
| RW-01773 | High | stimulus, rationale | Restore referenced underline. Restore italics. Restore official em dashes. Separate the introductory attribution from the quoted passage. |
| RW-01774 | Normal | rationale | Restore official em dashes. |
| RW-01775 | Normal | stimulus | Restore italics. |
| RW-01776 | Normal | stimulus, rationale | Restore bold Text 1 and Text 2 labels. Restore official em dashes. |
| RW-01777 | Normal | stimulus, rationale | Restore italics. |
| RW-01779 | Normal | stimulus, rationale | Restore italics. Restore bold Text 1 and Text 2 labels. Restore official em dashes. |
| RW-01780 | Normal | rationale | Restore official em dashes. |
| RW-01781 | Normal | rationale | Restore official em dashes. |
| RW-01782 | Normal | rationale | Restore official em dashes. |
| RW-01783 | Normal | stimulus, rationale | Restore official em dashes. Restore Iowa; capital I became lowercase l. |
| RW-01786 | Normal | rationale | Restore official em dashes. |
| RW-01788 | Normal | stimulus, rationale | Restore official em dashes. Restore the hyphens in proto-language. |
| RW-01789 | Normal | stimulus, rationale | Restore official em dashes. |
| RW-01790 | Normal | rationale | Restore official em dashes. |
| RW-01791 | Normal | rationale | Restore official em dashes. Restore the hyphen in art-based in the explanation. |
| RW-01792 | Normal | stimulus, rationale | Restore italics. Restore official em dashes. |
| RW-01793 | Normal | option-B | Restore the hyphen in by-product in choice B. |
| RW-01794 | Normal | stimulus, rationale | Restore official em dashes. |
| RW-01795 | Normal | rationale | Restore official em dashes. |
| RW-01798 | Normal | stimulus, rationale | Restore italics. Restore official em dashes. |
| RW-01800 | Normal | stimulus, rationale | Restore official em dashes. Restore official en dashes. |
| RW-01801 | Normal | stimulus, rationale | Restore italics. Restore official em dashes. |
| RW-01803 | Normal | rationale | Restore official em dashes. |
| RW-01804 | Normal | stimulus, rationale | Restore official em dashes. |
| RW-01805 | Normal | rationale | Restore official em dashes. |
| RW-01806 | Normal | stimulus, stem, rationale, option-A, option-B, option-C | Restore italics. Restore official en dashes. |
| RW-01807 | Normal | stimulus, rationale, option-B | Restore italics. |
| RW-01808 | Normal | stimulus, rationale | Restore official em dashes. Restore Iestyn; capital I became lowercase l. |
| RW-01809 | Normal | stimulus, rationale | Restore italics. Restore official em dashes. |
| RW-01810 | Normal | stimulus, rationale | Restore italics. Restore official em dashes. |
| RW-01811 | Normal | stimulus, rationale | Restore italics. Restore official em dashes. |
| RW-01812 | Normal | rationale | Restore official em dashes. |
| RW-01813 | Normal | stimulus, rationale | Restore italics. Restore official em dashes. |
| RW-01814 | Normal | rationale | Restore official em dashes. |
| RW-01816 | Normal | stimulus | Restore official en dashes. |
| RW-01817 | Normal | stimulus, rationale | Restore italics. Restore official em dashes. |
| RW-01819 | Normal | stimulus, rationale | Restore official en dashes. |
| RW-01821 | Normal | stimulus | Restore italics. Restore official em dashes. |
| RW-01824 | Normal | stimulus, rationale | Restore italics. |
| RW-01827 | Normal | stimulus | Restore italics. |
| RW-01828 | Normal | rationale | Restore official em dashes. |
| RW-01831 | Normal | stimulus | Restore italics. |
| RW-01832 | Normal | stimulus | Restore italics. |
| RW-01835 | High | rationale, option-C | Restore official em dashes in grammar answer choices. |
| RW-01836 | High | stimulus, rationale, option-C | Restore official em dashes in grammar answer choices. Restore misplaced or omitted closing single quotation marks around EGOT in the explanation. |
| RW-01841 | Normal | stimulus | Restore official em dashes. |
| RW-01842 | Normal | stimulus | Restore official em dashes. |
| RW-01843 | Normal | stimulus | Restore official en dashes. |
| RW-01844 | Normal | stimulus, rationale | Restore official em dashes. |
| RW-01845 | Normal | stimulus | Restore italics. |
| RW-01847 | Normal | stimulus, rationale, option-A, option-B, option-C, option-D | Restore italics. |
| RW-01848 | Normal | stimulus, rationale | Restore italics. |
| RW-01849 | High | stimulus, option-A, option-B, option-C, option-D | Restore italics. Restore official em dashes in grammar answer choices. |
| RW-01850 | High | stimulus, option-C | Restore official em dashes in grammar answer choices. |
| RW-01851 | Normal | rationale | Restore official em dashes. Restore the placement of the closing single quotation mark around chinampas in the explanation. |
| RW-01853 | Normal | stimulus | Restore official em dashes. |
| RW-01854 | Normal | stimulus | Restore italics. |
| RW-01857 | Normal | stimulus | Restore official em dashes. |
| RW-01859 | Normal | stimulus | Restore official em dashes. |
| RW-01861 | High | option-D | Restore official em dashes in grammar answer choices. |
| RW-01862 | Normal | stimulus | Restore official em dashes. |
| RW-01864 | Normal | stimulus, rationale | Restore italics. Restore the possessive apostrophe after towns in the explanation. |

## Questions that match the source

RW-01689, RW-01691, RW-01694, RW-01698, RW-01711, RW-01712, RW-01746, RW-01748, RW-01752, RW-01754, RW-01755, RW-01760, RW-01767, RW-01772, RW-01778, RW-01787, RW-01796, RW-01797, RW-01799, RW-01802, RW-01815, RW-01818, RW-01820, RW-01822, RW-01823, RW-01825, RW-01826, RW-01829, RW-01830, RW-01833, RW-01834, RW-01837, RW-01838, RW-01839, RW-01840, RW-01846, RW-01852, RW-01855, RW-01856, RW-01858, RW-01860, RW-01863.

## Versioned repair records

The final corrected content is retained in [Math records](../content/question-repairs/2026-10/math.json), [Reading and Writing records](../content/question-repairs/2026-10/reading-writing.json), and the [initial M-00254 repair](../content/question-repairs/2026-10/initial-question.json). These are historical records of changes already applied in production; merging this record does not replay database updates. [Verification results](../content/question-repairs/2026-10/verification.json), [source provenance](../content/question-repairs/2026-10/source-manifests.json), and [reviewed equation transcriptions](../content/question-repairs/2026-10/equation-transcriptions.json) support the review. Full backups and rendered comparison galleries remain local; prior versions are also retained in database content history.

Run `npm run verify-question-repairs` to validate all 185 versioned repair records, source wording and formatting in the 236 affected Reading and Writing fields, both restored chart figures, and the shared math output. This read-only check also runs in CI.
