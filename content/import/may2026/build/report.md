# May 2026 import — parse report

- Questions in key: 349
- Parsed rows: 346
- Clean: 300
- Flagged: 49
- Corrections applied: 15
- Figures referenced: 41

## Flags

| Q | Where | Key | PDF page | Flags |
|---|-------|-----|----------|-------|
| 86 | S1M2 Reading and Writing | A | part 1 p.NaN | skipped: source underline ("It was almost six.") contradicts the key (A: "It describes the warm patch") — one of them is wrong in the source; needs human adjudication before import |
| 98 | S1M2 Reading and Writing | A | part 1 p.NaN | leading unlabeled item hoisted into stem (verify stem) |
| 156 | S2M1 Math | (grid-in: 2) | part 1 p.NaN | entered-answer artifact stripped from SPR stem |
| 159 | S2M1 Math | (grid-in: 154) | part 1 p.NaN | entered-answer artifact stripped from SPR stem |
| 164 | S2M1 Math | (grid-in: 9) | part 1 p.NaN | entered-answer artifact stripped from SPR stem |
| 166 | S2M1 Math | C | part 1 p.NaN | 3 options (expected 4) |
| 172 | S2M1 Math | (grid-in: 36) | part 1 p.NaN | entered-answer artifact stripped from SPR stem |
| 175 | S2M1 Math | (grid-in: 0.375) | part 1 p.NaN | entered-answer artifact stripped from SPR stem |
| 177 | S2M1 Math | — | part 1 p.NaN | entered-answer artifact stripped from SPR stem; SPR key "—" unparseable — needs correction |
| 183 | S2M1 Math | (grid-in: 56760) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 188 | S2M1 Math | (grid-in: 567) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 192 | S2M1 Math | (grid-in: 22) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 197 | S2M1 Math | (grid-in: 7) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 198 | S2M1 Math | D | part 2 p.NaN | MCQ per key but no options parsed |
| 200 | S2M1 Math | (grid-in: 28) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 203 | S2M1 Math | (grid-in: 20) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 209 | S2M1 Math | — | part 2 p.NaN | SPR key "—" unparseable — needs correction |
| 213 | S2M1 Math | (grid-in: 75) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 215 | S2M1 Math | (grid-in: 638) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 231 | S2M2 Math | (grid-in: 12) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 232 | S2M2 Math | (grid-in: 23) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 234 | S2M2 Math | (grid-in: 3) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 239 | S2M2 Math | (grid-in: 116) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 240 | S2M2 Math | (grid-in: 17) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 248 | S2M2 Math | (grid-in: 84) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 249 | S2M2 Math | (grid-in: 5) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 251 | S2M2 Math | (grid-in: 3) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 256 | S2M2 Math | C | part 2 p.NaN | 3 options (expected 4) |
| 261 | S2M2 Math | (grid-in: 81) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 266 | S2M2 Math | (grid-in: 17) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 267 | S2M2 Math | (grid-in: 2600) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 272 | S2M2 Math | (grid-in: 48) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 273 | S2M2 Math | (grid-in: -9.5) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 282 | S2M2 Math | (grid-in: 54) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 283 | S2M2 Math | D | part 2 p.NaN | MCQ per key but no options parsed |
| 287 | S2M2 Math | (grid-in: 13) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 295 | S2M2 Math | (grid-in: -5) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 297 | S2M2 Math | C | part 2 p.NaN | skipped: keyed option C is truncated mid-table and option D is entirely absent from the source capture — cannot reconstruct faithfully |
| 301 | S2M2 Math | (grid-in: 3) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 302 | S2M2 Math | (grid-in: 29) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 306 | S2M2 Math | D | part 2 p.NaN | skipped: options C and D (D is the key) are not visible in the source capture — cannot reconstruct |
| 308 | S2M2 Math | (grid-in: 75) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 311 | S2M2 Math | (grid-in: 3/2) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 314 | S2M2 Math | (grid-in: 6) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 318 | S2M2 Math | (grid-in: 84) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 325 | S2M2 Math | (grid-in: 1300) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 326 | S2M2 Math | (grid-in: -37/4) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 335 | S2M2 Math | (grid-in: 12) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |
| 345 | S2M2 Math | (grid-in: 54) | part 2 p.NaN | entered-answer artifact stripped from SPR stem |