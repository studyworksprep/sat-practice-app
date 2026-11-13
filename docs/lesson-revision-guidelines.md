# Lesson revision guidelines

> **Status: Living document.** Adopted 2026-11-11 from the review of
> Solving Equations by Graphing.

Revise each lesson around one reusable method. Students should understand
why each activity helps and finish able to choose and carry out the method
independently. Use these guidelines for teaching, pacing, and presentation,
alongside the JSON schemas and validation rules in the authoring guide.

The reference lesson starts with a difficult equation, teaches a short
graphing procedure, and returns to the original question. Its explanations
and calculator activities have separate cards. Use that progression when
the opening question can show a clear reason to learn the method.
[Reference lesson](lesson-template-specs/solving-equations-by-graphing-x-intercepts.json).

## Build a coherent progression

1. **Start with a question that gives the skill a purpose.** Choose a
   problem that is difficult, tedious, or hard to approach with the
   student's existing tools. Invite a brief, ungraded attempt. Let the
   student continue with a partial attempt or an observation about where
   they got stuck.
2. **Explain why you started there.** After the attempt, explain how the
   method will help. When introducing an easier example, explain why it
   helps the student learn the method. For example, “We’ll try it on
   \(x+5=0\) first so you can see what to look for, then come back to the
   square roots.”
3. **Use the simplest example that teaches the actual move.** Begin with
   the action students will eventually use. For graphing, type \(x+5\),
   explain why the x-axis corresponds to zero, and find the x-intercept.
   Introduce prerequisite ideas when the student needs them.
4. **State a short procedure, then teach useful variations.** Name the
   method and use the same language throughout. Add a variation when it
   changes what the student must do or report. Teach one change at a time
   and connect it to the familiar procedure. For example, moving terms
   leaves an equation equal to zero, putting it back into the form the
   student already knows how to solve.
5. **Return to the opening question with less help.** Remind students
   where they started and invite them to use the method. Let them decide
   the setup. Put more specific guidance in retry hints and a worked
   solution. Then give fresh applications so they demonstrate that the
   method works beyond the opening question.
6. **Finish with independent practice.** Include a short recall of the
   method before the independent set. Practice questions should test the
   core skill and the variations taught. Students should choose their own
   setup. Close with a brief sign-off.

## Choose an opening that earns the method

Try the candidate problem with ordinary algebra, a basic calculator, and
the shortcuts its answer choices allow. The opening should expose a
specific obstacle that the lesson's method removes. Several products to
expand, coupled equations, or a group of values to transform and combine
can make the benefit visible. Larger numbers alone do not.

- Compare the work both ways. A one-step cancellation or a short
  substitution is a poor introduction to a longer calculator setup.
- Keep the obstacle inside the lesson's scope. Do not make the question
  difficult by using an untaught command or adding an unrelated concept.
- Check for accidental shortcuts. A modeling question whose choices all
  have different starting values may need no regression at all.
- Keep the first attempt brief and ungraded. The student needs to notice
  the difficulty, not finish a long calculation before continuing.
- In the debrief, name that difficulty and explain how the tool helps.
  Save the simple example for teaching the mechanics.
- At the return, let the student choose the setup. Update the shared
  question, answer, hints, worked solution, calculator state, and any
  validation together. Give a genuinely new question a new block ID so
  an earlier answer cannot be mistaken for an attempt at the replacement.

For Reading and Writing, test the opening both with and without the
lesson's process. The obstacle should be a distinction the process helps
students make, not obscure vocabulary or an unnecessarily long passage.

- Make each wrong answer worth considering. Reuse a real detail, preserve
  part of a claim, or offer a natural but mismatched grammatical structure.
  Then give it a specific reason to fail: scope, attribution, evidence,
  relationship, the writing goal, or sentence structure.
- Write down why a student might choose each distractor and what rules it
  out. For the closest competitor, point to the exact evidence or language
  that makes the key better. Revise the item if two choices remain
  defensible; difficulty should come from the reading task.
- Check for shortcuts in the choices. The key should not stand out by
  length, cautious wording, or repeated vocabulary while the distractors
  advertise themselves with extreme or irrelevant claims.
- Show the same passage, task, and choices at the opening and the return.
  Keep the first attempt ungraded, explain what made the choices hard to
  separate, and let the student apply the method independently at the
  return. Use the retry hint and worked solution to show the deciding
  distinction and explain each tempting wrong choice.

## Keep each card focused

- **Give explanations room.** Put a substantial explanation or transition
  on its own card. Hide Desmos when the student is reading an idea that
  needs no graph. A short explanation card can use the full reading width.
- **Introduce the variation before its example.** An informational card
  should explain what changes and how the method still applies. It must
  make sense before the student sees the next question. Put that example's
  definitions, numbers, restrictions, and task on its activity card. A
  worked example can discuss a specific problem when that problem is
  visible alongside it; a debrief can refer back to an attempt already seen.
- **Keep action instructions short.** Aim for one clear task. “Move
  \(7x\) to the left side, then graph that side” is enough after the reason
  for the move has been taught. Choose the number of cards from the
  instructional jobs they perform.
- **Keep relevant information visible.** Use a shared prompt for a
  question, passage, or table that several steps refer to. Show it on the
  blocks that need it. With Desmos open, keep the prompt above the
  instructions on the left and give the calculator the right column.
- **Keep a complete question together.** On an ungraded multiple-choice
  attempt, put the stem and all answer choices in the question card. Keep
  the brief attempt instructions in the instructional card. On a graded
  return, show the choices once as interactive answer buttons; use a
  stimulus-only prompt there rather than repeating the static choices.
- **Include only useful distinctions.** Keep a definition, warning, or
  explanation when it helps students perform the method, understand why it
  works, or handle a necessary variation. For the x-intercept method,
  differences between lines and curves add little. Reading the correct
  variable, matching exact choices, and counting a touch of the axis affect
  the answer.
- **Keep concepts in service of the tool.** Every card should help students
  use the method, handle the upcoming situation, or retain an essential
  step. Briefly explain unfamiliar notation when needed, then show how the
  same tool handles it. In Graph Match, students can define the functions
  and graph \(f(g(x))\) as written. Have them compare graphs rather than
  quiz them on composition order or teach hand substitution. Include
  conceptual understanding when it is needed for the process or retention;
  avoid adding a separate conceptual hurdle to a tool that already works.
- **Use familiar, accurate language.** Say “Move every term to one side,
  changing the sign of each term you move. That leaves zero on the other
  side.” Explain the connection to the familiar form immediately.
- **Make new terms easy to notice.** Bold an important new term on its
  first use and explain it in plain language nearby. Keep emphasis
  selective, and use the same term consistently afterward. Match
  calculator questions to the visible readout: “What does z equal now?”
  is clearer than “What value has been assigned to z?”
- **Teach the direct calculator entry.** Type an expression in \(x\) to
  graph it when that is sufficient. Include extra notation when the
  method needs it.
- **Keep the core procedure lean.** Include the steps needed to obtain
  the answer. Offer substitution as optional reassurance when graphing
  already gives a valid solution. Require verification when the particular
  method needs it to establish that an answer is valid.

## Make feedback support the next attempt

Confirm that the student succeeded, then briefly connect their work to the
skill. Desmos messages should acknowledge the action performed, such as
“Nice work! You used \(x\) in place of \(t\).” Question checks can use the
viewer's correct-answer confirmation followed by a short explanation.

Show encouragement for correct work. A wrong attempt should receive a
useful nudge, and a revealed solution should explain how to proceed.
Check these states in the preview so a student who needed help receives
appropriate feedback.

Match the guidance and grading to the task. Early activities can specify
what to enter. Later activities should ask students to apply the method.
Accept the valid approaches allowed by the prompt, including moving terms
to either side when both produce a suitable expression.

## Review before replacing a lesson

- Read the sequence aloud. Every transition should make the purpose of the
  following activity clear.
- Preview every step at a laptop width and a narrow width. Check the
  amount of text, the visibility of the question, and whether the
  calculator helps on that particular card.
- Try a correct response, a realistic wrong response, and a retry.
  Check valid alternative setups, success messages, and progression.
- Confirm that independent tasks require the student to choose the setup.
  Graphs supplied on an answer-reading card should match the preceding
  activity.
- Run the lesson validators and review each lint warning in context.
  A consecutive set of homework checks can be intentional.
- Give the lesson a title that describes the skill being taught. Keep
  experiment and version labels in authoring metadata.
- Preserve the previous specification in the archive. When publishing a
  replacement, verify its curriculum placement, tags, and active
  assignments, and retain the earlier lesson's recorded student history.

Use the authoring guide for supported block formats, shared prompts,
calculator settings, and validation commands.
[Lesson JSON authoring guide](lesson-json-authoring-guide.md).
