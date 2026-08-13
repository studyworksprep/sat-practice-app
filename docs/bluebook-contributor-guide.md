# Contributing Bluebook results

> **Status: Living document.** Written for contributors (tutors and
> invited outside contributors), not for engineers. Last verified
> against the shipped flows: 2026-08-13.

## Why this exists

Studyworks reports a practice-test score out of 1600. Getting from
"22 of 27 correct in Reading & Writing module 1" to "a 640" needs
College Board's own conversion table, and College Board doesn't publish
it. We reconstruct it from real Bluebook results: every official report
someone sends fills in another point on the curve.

Where we have a real data point, the app reports the exact score the
student would have got. Where we don't, it estimates — and an estimate
can be off by 20 or 30 points, which is the difference between a student
believing they're on track and believing they aren't.

## The one rule: no student names

Never put a student's name, email, initials, or anything else that
identifies them into a submission. There is no field for it and there
shouldn't be one.

If you need to tell your own submissions apart, the label field takes
something like "Student A" or "Tue 4pm". Only you ever see it.

Getting the student's agreement to share their scores is your
responsibility, not ours. What reaches us is a set of numbers and a
right/wrong pattern — no name attached — but it is still their test.

## The quickest route: send the score report

If you have access to the student's College Board account, this takes
about a minute and involves no typing beyond two numbers. Every new
submission also needs an image of the score summary so a reviewer can
verify those two manually entered numbers.

1. Sign in at **mypractice.collegeboard.org**.
2. Open the practice test.
3. Choose **Score Details**, then go to the **question-by-question detail view** — the table listing
   every question with its correct answer and whether it was answered
   correctly. (Not the summary page: the summary has the scores but not
   the per-question data.)
4. Save the page as HTML. In most browsers: **File → Save Page As**, and
   choose **Webpage, HTML Only** (the exact wording varies). A `.htm` or
   `.html` file lands in your downloads.
5. Return to the test's score-summary view and take a screenshot that
   clearly shows the practice-test name and the Reading and Writing and
   Math scores. Crop out the student's name, email address, and any other
   identifying information. On macOS use **Shift–Command–4**; on Windows
   use **Windows–Shift–S**. Save as PNG, JPEG, or WebP (5 MB maximum).
6. In Studyworks, go to **Contribute → New submission → Upload the score
   report**, pick the submission purpose and practice test, and attach
   both files. If a scoring-study coordinator gave you a pattern ID,
   enter it exactly; never substitute a student's name.
7. Type the two section scores from the summary. The screenshot is what
   lets the reviewer verify them.

You'll see the counts we read out of the file before you send it. If
they don't match the report in front of you, you've probably got a
different test selected — check that before sending.

## If your student took the test in Studyworks

Use **Link an in-app test**. We already have every answer they gave, so
you don't re-enter any of it.

1. Pick the attempt.
2. Use the on-screen list to key those same answers into Bluebook.
   It's laid out in order, in large type, one module at a time,
   specifically so you can read it while typing into another window. A
   dash means the question was left blank.
3. Bluebook gives you official scores. Type those in.
4. Capture and attach the score-summary screenshot described above;
   it is required so the reviewer can verify the typed scores.
5. If you also saved the report, attach it — we'll check it against the
   attempt question by question.

**If the check finds a mismatch**, an answer got mis-keyed into Bluebook
somewhere. We'll tell you exactly which question numbers disagree. Fix
those in Bluebook, re-export, and try again. The scores are only worth
recording if the answers behind them are the ones the student actually
gave.

If you're confident the report is right and our record of the attempt is
wrong, send the report through **Upload the score report** instead —
that route uses the report's own answers.

## If you have neither

**Mark the wrong ones** is the fallback. Everything starts marked
correct and you flip the ones that were missed.

Enter the number correct for each module first, from the report summary.
The grid then won't let you send until the number you've flipped matches
— which is the check that catches a slipped row. When you flip a
question you can optionally record which answer they picked; it's useful
data about which wrong answers tempt students, but it's genuinely
optional and skipping it costs nothing. Attach the required score-summary
screenshot before sending so the reviewer can verify the scaled scores.

This route takes the longest and is the one a reviewer scrutinises most,
because nothing corroborates it but that checksum. Use it when the
others don't fit.

## What happens next

Every submission goes `pending → verified → promoted`.

- **Pending** — waiting for a reviewer.
- **Verified** — accepted, but not yet in the scoring data.
- **Promoted** — in the scoring data. This is the finish line.
- **Not accepted** — a reviewer found a problem and left a note.

Once you've had three submissions promoted and none rejected, ordinary
**uploaded score reports** may be accepted without waiting for a reviewer.
Controlled scoring-study submissions always receive human review because
the reviewer must compare the typed scores with the summary screenshot.
Hand-entered grids always get read by a person, and so does anything
that disagrees with data we already have, no matter how good your
record.

Nothing is ever written into the scoring data automatically. A human
promotes every submission, including auto-accepted ones.

## Things that get flagged

- **"Another official report gave a different scaled score."** Two
  reports disagree about the same module counts. On an ordinary
  contribution a reviewer checks both. In a scoring study, the different
  response patterns are deliberately preserved as separate observations;
  they are never collapsed into one count-only row.
- **"The module 1 count doesn't match the module 2 form."** On an
  adaptive test, module 1's score determines which module 2 the student
  sees. If those don't line up, one of the numbers is off.

## When something won't parse

College Board changes the report format from time to time. If the
uploader says it can't read your file, it's worth telling us — it
usually means a new format has appeared and we need to teach the parser
about it. We keep every uploaded file, so once we've done that, your
submission can be re-read without you doing anything again.

Send the file, along with what you were trying to do, through the Help
link.
