-- Preserve the published block ID and existing student progress.
update public.lesson_blocks b
set content = (b.content - 'input' - 'answer' - 'solution') || $check$
{
  "id": "use_both_system_values",
  "allow_retry": true,
  "prompt": "Two students get different fits for the same system. One gets \\((a,b)=(6,9)\\), and the other gets \\((9,6)\\). Which expression gives a different result for the two students?",
  "choices": [
    "\\(a+b\\)",
    "\\(ab\\)",
    "\\(a-b\\)",
    "\\(a^2+b^2\\)"
  ],
  "correct_index": 2,
  "hint": "Try each expression with both ordered pairs.",
  "explanation": "With the first fit, \\(a-b=-3\\). With the second, \\(a-b=3\\). Swapping the values leaves the sum, product, and sum of squares unchanged.",
  "calculator": {
    "display": "hidden"
  }
}
$check$::jsonb
from public.lessons l
where l.id = b.lesson_id
  and l.title = 'Solving Equations with Regression'
  and b.block_type = 'check'
  and b.content->>'id' = 'use_both_system_values'
  and b.content->>'answer' = '54';
