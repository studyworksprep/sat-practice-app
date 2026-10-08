# SAT Question Bank Repair Record

**Historical — audit and production repair completed October 7, 2026.**

The initial M-00254 repair restored its right-triangle diagram and complete prompt, preserving its four choices and key D. It was verified in the live bank again on October 8. The subsequent batch contained 53 further questions.

All 53 reviewed questions were repaired in production using complete originals from College Board's question-bank website API: the 46 questions marked Broken and the seven additional published questions with truncated answer choices. The 46 Broken flags were cleared after content and display verification. All 53 associated pending repair drafts now contain the verified replacement content and are marked promoted.

The saved content matches all 53 reviewed replacements exactly. All answer keys, question identities, choice labels and ordinals, taxonomy, publication status, student statistics, and practice-test placements were preserved. Full-row fingerprints confirm that all 67 existing student attempts are unchanged. All six practice-test membership records are unchanged. Each repaired question has one verified snapshot of its prior content.

Verification covered the shared renderer and sanitizer, all 53 browser previews, every answer key against the official original, image decoding, and 67 graph/diagram/table assets. SVG geometry survived rendering, and the normalized source images matched the originals within the accepted raster tolerance. No truncation markers, blank required fields, broken images, horizontal overflow, or math error nodes remained. The production query returned zero published standard-pool questions marked Broken at verification time. TypeScript checking passed.

The verification summary (local audit artifact), original-source manifest (local audit artifact), and pre-repair backup (local audit artifact) retain the evidence and recovery data. Repair-draft notes record the source identifier, retrieval time, source checksum, verification, and Codex provenance. The database connection has no signed-in user UUID; it does not attribute this repair to a previous human fixer.

After review of the random comparison sample, three presentation corrections were applied on October 7. M-01704 now uses the shared MathJax renderer for its equation, variables, numeric choices, and rationale instead of the older API's equation images. M-00438's complete original stem layout and existing verified graph were restored; the first repair had moved its context and graph into a shaded stimulus box, although the mathematical content was equivalent. M-01684 now places the restored context, a centered display equation, and the question together in the stem. These changes preserve prose, mathematical values, answer keys, choice identities, and unrelated question fields. Matching draft copies and rendering caches were saved, and each of these three questions now has two prior-content snapshots. M-00704, a different question outside the random sample, was inspected and left unchanged.

The presentation verification summary (local audit artifact) records exact saved-content and cache checks, preservation checks, and the additional snapshot verification. The same ten-question comparison sample was refreshed. Future native API repairs should preserve a complete existing layout and convert reviewed equation images to MathML or TeX so they use the application's math styling; graph and diagram images should retain their original artwork.

The subsequent full presentation audit reviewed all 53 repaired questions and corrected 26 additional questions. Twenty-five still contained equation images that bypassed the application's math renderer, including expressions in answer choices and explanations. All 229 occurrences were replaced with reviewed TeX transcriptions of 181 distinct expressions, checked directly against the source image contact sheets. The saved questions now contain no equation images of this kind. Native graphs, diagrams, and figure images were preserved exactly in this follow-up.

Ten questions also needed their content consolidated in the stem: M-00387, M-00420, M-00430, M-00729, M-00769, M-00944, M-01008, M-01185, M-01347, and M-01647. The four narrative-context cases were M-00420, M-00944, M-01347, and M-01647; the remaining cases had equations, a system, or tables introduced as separate stimuli during repair. Existing equation-only or diagram-only stimuli were retained when their placement was already established. QTI table wrappers were normalized for M-01099 and M-01185 while preserving every cell value. The other complete-original candidate, M-01567, retained the same stem structure and mathematical content; its source SVG graph representations passed the prior source-geometry checks and did not require another correction.

All 53 browser previews passed checks for required content, image loading, mathematical rendering, and horizontal overflow. Exact production fingerprints matched all reviewed source fields and rendering caches. All answer keys, choice identities, student statistics, and unrelated question fields were preserved. Each of the additional 26 questions has a verified snapshot of its immediately preceding content and a matching promoted-draft copy. The three first follow-up questions were unchanged during this broader pass; 24 other questions needed no further correction. The bank now retains 82 snapshots across these 53 questions. The original ten-question comparison sample was refreshed again, and TypeScript checking passed.

The full presentation verification summary (local audit artifact), question-by-question inventory (local audit artifact), reviewed equation transcriptions (local audit artifact), and backup before the broader pass (local audit artifact) retain the detailed evidence and recovery data.

The following sections preserve the initial audit findings and proposed longer-term workflow improvements. This repair used reviewed scripts and guarded updates to existing questions; it did not require an application deployment.

## Initial audit

Audit date: October 7, 2026. The production bank has 46 published questions marked Broken, all in Math. Thirty have explicit import truncation markers, nine lack required content, five need equation formatting repair, and two appear complete. Repair the five formatting cases and verify the two complete candidates first; retrieve originals for the other 39.

The initial audit made no changes to live questions or their flags. The authorized repairs described above were applied afterward.

| Finding | Questions | Recommended action |
| --- | ---: | --- |
| Truncated prompt content | 21 | Recover the complete original prompt and figure. |
| Truncated separate graph or diagram | 9 | Recover the complete original stimulus. |
| Missing equations, tables, context, or score data | 9 | Restore exact source content; check choices where damaged. |
| Intact equation with formatting that produces blank server output | 5 | Normalize the paragraph markup, render, preview, and clear Broken. |
| Content appears complete | 2 | Verify the final display and original, then clear Broken. |

All 46 identifiers match records in the saved College Board Math metadata (local audit artifact). The inventory below includes canonical eight-character College Board IDs, including mappings for older DC identifiers. These matches identify what to retrieve; they do not verify that every original remains available today. The local pilot exports contain none of these 46 originals. All 46 pending repair drafts are empty, and none of the 46 questions has a stored content history snapshot to restore.

## Recommended repair process

1. Retrieve originals directly from the public JSON API used by the [College Board Educator Question Bank](https://satsuiteeducatorquestionbank.collegeboard.org/), retaining each question ID and untouched response. Use original PDFs for visual crosschecks when needed. College Board supports exporting selected prompts and rationales to PDF. ([Official overview](https://satsuite.collegeboard.org/k12-educators/tools-resources/question-bank/overview))
2. Create proposed replacements using complete source content and figure assets from the API. Map modern and older response formats separately, normalize HTML, and preserve all choices and embedded figures. Review each restored figure, table, equation, choice, key, and rationale against the original. The existing comparison screen accepts Mathpix MMD ZIPs with figures and metadata, paired with a reference PDF; add a native JSON adapter for API repairs rather than converting those originals through OCR.
3. Update each existing question in place after review, preserving its UUID, display code, choice labels and ordinals, answer key, test membership, and student attempts. Any disagreement with the official key requires separate grading review.
4. Render and sanitize all replacement fields before saving. Confirm that nonempty source content stays visible, required figures load, and no truncation markers or math errors remain. Commit the replacement and clear Broken together; record the fixer and fixed date, retain a prior-content snapshot, and reject changes against stale question timestamps.
5. Verify the saved student display and practice-test placement, then close the associated repair draft. Keep source references and verification results with the repair record.

The five formatting cases are M-00315, M-00537, M-00947, M-01243, and M-01704. Their equation text is intact. Paragraphs with an unquoted `align=center` attribute produce an empty string through the shared server math renderer. Replacing only the opening paragraph with a centered style restores rendering in all five cases without changing the equations. Local proposed replacements passed rendering and sanitization checks and are saved in formatting proposals (local audit artifact).

M-00438 has a reachable, readable cab graph consistent with its keyed slope answer. M-01567 has all four reachable, readable graph options; choice A matches the supplied equations. Their raw content, keys, and rendered math passed the checks used here. They are candidates for clearing after final comparison with the originals.

Prioritize M-00277, M-00439, M-00638, M-00764, and M-01250 among the questions requiring source recovery because they belong to practice tests. Their locations appear in bold below.

## Question inventory

| Question | College Board ID | Finding and practice test placement |
| --- | --- | --- |
| [M-00049](https://studyworks.io/admin/questions/f201037f-91e6-4495-8d1c-aed0d4812d73) | d112bc9d | Truncated prompt and figure |
| [M-00051](https://studyworks.io/admin/questions/9994e41e-f7af-4e5e-b4f2-13409e89b212) | a9647302 | Truncated prompt and figure |
| [M-00079](https://studyworks.io/admin/questions/02ed1bc8-db16-4f98-8e56-13c3a2d063fa) | b0c5ece5 | Truncated prompt and figure |
| [M-00253](https://studyworks.io/admin/questions/640ae4a9-7298-481c-a7e6-fb1ed2e05ef8) | 69f4bbdc | Truncated prompt and figure |
| [M-00277](https://studyworks.io/admin/questions/ccf4ce7c-0068-4f9e-9a74-785680d119c3) | 5b918ebb | Truncated prompt and figure; **Test 7, Math Module 2, easy, Q10** |
| [M-00315](https://studyworks.io/admin/questions/5dc18e86-62f8-4b81-a8fa-ede7831890b7) | b9839f9e | Equation paragraph renders blank |
| [M-00330](https://studyworks.io/admin/questions/365f6489-f667-41f6-b940-937f1906e32e) | 36661021 | Truncated prompt and figure |
| [M-00353](https://studyworks.io/admin/questions/f4cd7523-e9c7-4f9b-9600-d3094d81cc10) | 3828f53d | Truncated graph or diagram |
| [M-00387](https://studyworks.io/admin/questions/f97a97ca-63fa-4c96-8292-cf88b8ed9516) | 12983c1e | Missing table for the linear function. |
| [M-00420](https://studyworks.io/admin/questions/0d7ce243-fc84-4908-b079-706f1225e23f) | e821a26d | Truncated graph or diagram |
| [M-00430](https://studyworks.io/admin/questions/96414fd4-4ecb-4457-bfa4-e3c0807293d5) | 87322577 | Missing equation relating running and biking time. |
| [M-00438](https://studyworks.io/admin/questions/ff66108b-6ac9-4db5-a0f3-0a4cbce23850) | 3f5375d9 | Appears complete; verify and clear |
| [M-00439](https://studyworks.io/admin/questions/062d5498-3ebb-4461-ac8c-b33d9dcda7ef) | 43236565 | Truncated prompt and figure; **Test 5, Math Module 1, Q3** |
| [M-00537](https://studyworks.io/admin/questions/f43d325c-5b29-4001-9ee6-789339eae759) | dd797fe2 | Equation paragraph renders blank |
| [M-00595](https://studyworks.io/admin/questions/c7bb4b2b-50e9-4d3f-887e-eb313d972f7b) | 79340403 | Truncated prompt and figure |
| [M-00638](https://studyworks.io/admin/questions/431b410b-9e4a-4c13-b484-fcbf02de4a59) | cf0d3050 | Truncated prompt and figure; **Test 8, Math Module 2, easy, Q10** |
| [M-00653](https://studyworks.io/admin/questions/8ed58fed-d447-4492-b994-736e9e622c3f) | fdfc90e4 | Truncated prompt and figure |
| [M-00702](https://studyworks.io/admin/questions/e915cc18-5753-44d9-9dd8-17457e211597) | 9eb896c5 | Truncated graph or diagram |
| [M-00721](https://studyworks.io/admin/questions/ef1a3e69-c886-4e6b-8ed9-cc32e1dfb6ed) | 93779b53 | Truncated prompt and figure |
| [M-00722](https://studyworks.io/admin/questions/12e7912f-b5dd-417b-97c9-f8068bcfeaa2) | 95ba2d09 | Truncated graph or diagram |
| [M-00729](https://studyworks.io/admin/questions/6a7a71ea-9ba3-4ecc-a56d-c448deb5022b) | e53870b6 | Missing equation containing k. |
| [M-00764](https://studyworks.io/admin/questions/040b13e4-90a6-4e8e-bcaf-952b62803b09) | a4ed5285 | Truncated prompt and figure; **Test 5, Math Module 2, easy, Q16** |
| [M-00769](https://studyworks.io/admin/questions/527eab2c-ca76-4b0f-b8b2-2ebe37864338) | 948087f2 | Missing system of inequalities. |
| [M-00771](https://studyworks.io/admin/questions/0ac644d6-6884-41f0-a3d6-3a39dcdc43b6) | 87a9a2d4 | Truncated prompt and figure |
| [M-00944](https://studyworks.io/admin/questions/28a4044e-63fd-43e9-ac05-4939be5dbc2d) | 5c24c861 | Truncated graph or diagram |
| [M-00947](https://studyworks.io/admin/questions/5b0a5c32-64c9-4e55-8c54-3c7bbcc87e0b) | b23bba4c | Equation paragraph renders blank |
| [M-00966](https://studyworks.io/admin/questions/8cf37726-fe3d-46e6-89c0-0d2763092059) | 661dfddd | Truncated prompt and figure |
| [M-00982](https://studyworks.io/admin/questions/412365a0-febf-41a5-bd75-12572437f053) | 6dd463ca | Truncated graph or diagram |
| [M-00996](https://studyworks.io/admin/questions/cf2dd9cb-2791-47b9-8af8-ed3d615f75dc) | 5733ce30 | Truncated graph or diagram |
| [M-00997](https://studyworks.io/admin/questions/320bc7ff-96e3-44df-855e-5ed0ab9815cf) | e6f2ace7 | Truncated prompt and figure |
| [M-01008](https://studyworks.io/admin/questions/6d85070e-cea7-4bc8-a7f9-ec50509253fa) | 113b938e | Missing bicycle speed equation. |
| [M-01075](https://studyworks.io/admin/questions/559abfab-d7c7-47db-b885-3f06149591ea) | a6097ec2 | Truncated prompt and figure |
| [M-01185](https://studyworks.io/admin/questions/d8c5229b-b17f-4c28-b3de-fcf550aeeb8a) | b2de69bd | Missing x and y table. |
| [M-01234](https://studyworks.io/admin/questions/2b5d7399-251d-4d39-8915-9a5d3540dc4f) | 79137c1b | Truncated graph or diagram |
| [M-01243](https://studyworks.io/admin/questions/cab15671-82ee-496b-a426-08090d1b7407) | 550b352c | Equation paragraph renders blank |
| [M-01250](https://studyworks.io/admin/questions/d1dcca88-3290-4cb6-8baf-e6449e1a1032) | 0d3f51dc | Truncated prompt and figure; **Test 10, Math Module 2, easy, Q8** |
| [M-01323](https://studyworks.io/admin/questions/8885b51f-908d-46d2-96fe-3b03e0654207) | d683a9cc | Truncated graph or diagram |
| [M-01347](https://studyworks.io/admin/questions/32bca478-a2f6-49e3-bc04-e18e506a69ae) | 620fe971 | Missing cargo context and equation. |
| [M-01395](https://studyworks.io/admin/questions/3bbd4e59-d1a1-4e82-94c7-0aab23f2123d) | 2f7c92ad | Truncated prompt and figure |
| [M-01517](https://studyworks.io/admin/questions/c480c108-016b-4bad-9de7-3445bf73fa6a) | 3b4b5b1e | Truncated prompt and figure |
| [M-01537](https://studyworks.io/admin/questions/e64d1321-6824-4799-9865-2cf3cccd27bb) | 9d078710 | Truncated prompt and figure |
| [M-01567](https://studyworks.io/admin/questions/f6c79076-39b6-435a-8794-61820736de81) | 75a32330 | Appears complete; verify and clear |
| [M-01590](https://studyworks.io/admin/questions/010ff532-16a5-4cd2-84a8-a59551209076) | 64c1f044 | Truncated prompt and figure |
| [M-01647](https://studyworks.io/admin/questions/d8e83c61-e9d5-41d3-99e8-6c7c75f2b8a6) | 44d65912 | Missing score data; choices A and C are identical. |
| [M-01684](https://studyworks.io/admin/questions/171cf4ad-cf44-40de-92e5-788b21c5301d) | 3462d850 | Missing driving context and equation. |
| [M-01704](https://studyworks.io/admin/questions/78044f09-b0f6-4eec-9b49-6425908a4b1c) | 255996a6 | Equation paragraph renders blank |

## Repair workflow improvements

The [current College Board website client](https://satsuiteeducatorquestionbank.collegeboard.org/assets/index-DopRrmt2.js) uses POST requests to `https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital/get-question` with an `external_id` value. For older items, send their DC identifier as that value. Its `get-questions` endpoint provides metadata for resolving the eight-character question ID to an external ID or older identifier. No supported public developer specification for question content was found; the website API may change.

Three initial API probes on October 7 returned HTTP 200 without credentials. M-01250 returned its complete 39,089-character prompt and figure, compared with the 10,034 characters previously stored. M-00387 returned its missing table. M-01647 returned its missing game data and the distinct original choice A. The complete repair subsequently retrieved and validated originals for all 53 questions; every existing answer key agreed with its original.

Modern responses contain `stem`, optional `stimulus`, `answerOptions`, `correct_answer`, and `rationale`. Older responses use `body`, `prompt`, and an `answer` object containing choices, key, and rationale. Preserve both `body` and `prompt` when present. Fetch affected questions at a modest rate with retries and local caching, then produce proposed repairs before applying any live changes.

The [import comparison action](<../app/(admin)/admin/questions/import/actions.ts#L109>) currently rejects replacements for Broken questions. Add a reviewed repair operation that permits those targets and clears the flag only after successful content validation. Keep its existing timestamp guard, identity matching, and answer preservation.

The [draft promotion action](<../app/(admin)/admin/content/drafts/[draftId]/actions.js#L104>) copies content and invalidates rendering caches but leaves Broken set. A verified repair promotion should render the content, save it, clear the flag, record the fixer and fixed date, and mark the draft promoted in one transaction. An ordinary partial draft should not automatically clear Broken.

Extend the [bank validator](../scripts/validate-bank.mjs#L105) to reject explicit truncation markers across prompts, stimuli, choices, and rationales; inspect image sources in choices as well as prompts; detect math error nodes and nonempty fields that render blank. References to absent tables or equations still require source comparison. Normalize HTML attributes before rendering and retain full figure content during imports.

## Additional questions needing review

The initial audit found seven published questions outside the Broken filter with truncation markers in their answer choices. All seven were included in the completed repair and display review. Their existing non-Broken status was preserved.

| Question | College Board ID | Finding |
| --- | --- | --- |
| M-00542 | e9aed539 | Truncation marker in choices |
| M-00613 | ab7740a8 | Truncation marker in choices |
| M-00639 | 15ce8207 | Truncation marker in choices |
| M-01056 | d46da42c | Truncation marker in choices |
| M-01099 | b39d74a0 | Truncation marker in choices |
| M-01178 | aa95fb33 | Truncation marker in choices |
| M-01623 | d675744f | Truncation marker in choices |

The complete structured inventory, including existing draft IDs and expected question timestamps, is saved in repair inventory (local audit artifact).

## Versioned repair records

The final corrected content is retained in [Math records](../content/question-repairs/2026-10/math.json), [Reading and Writing records](../content/question-repairs/2026-10/reading-writing.json), and the [initial M-00254 repair](../content/question-repairs/2026-10/initial-question.json). These are historical records of changes already applied in production; merging this record does not replay database updates. [Verification results](../content/question-repairs/2026-10/verification.json), [source provenance](../content/question-repairs/2026-10/source-manifests.json), and [reviewed equation transcriptions](../content/question-repairs/2026-10/equation-transcriptions.json) support the review. Full backups and rendered comparison galleries remain local; prior versions are also retained in database content history.
