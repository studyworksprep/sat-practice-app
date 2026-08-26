# Trap Catalog

> **Status: Living — confirmed 2026-08-26 (plan step 2.6).**
> Seeded 2026-08-24 from the corpus itself (distractor explanations,
> hints, worked solutions, and the Good Cop / Bad Cop wrong-choice
> debriefs across all 32 specs); revised 2026-08-25 per tutor feedback:
> every row carries a **scope**, recurring error types are named
> once as **cross-lesson families**, and rows are stated at type grain.
> **Confirmation was an owner blanket sign-off of the catalog as
> drafted** — all 209 rows, names, scopes, and the 10 family names —
> not a per-row tutor session. The check-artifact rows stay, documented
> as never-drafted. As a Living doc, any row may still be renamed or
> deleted on real student observation; note it here and in the 2.3/2.4
> items drafted from it. Known gap: the four reverse-drift lessons
> (desmos-sliders, equivalent-expressions-regression, circle-toolkit,
> initial-modifiers) have no rows yet.

## How to read scope

A trap's scope says where the error can occur — and what may be
drafted from it:

- **test** — an error in the real question-solving process. The core
  of the catalog: the ONLY rows that feed transfer items, the 2.4
  authentic-format items, and the pattern catalog.
- **method** — an error executing our taught technique with real
  consequences (`=` instead of `~` gets no fit; lowercase x collides
  with Desmos's graphing role). Legitimate distractor material for
  guided workflow checks only.
- **check-artifact** — a distinction that exists only because our
  check format asks about it (reporting X instead of x). Documents
  what a guided check verifies; **never drafted into any distractor.**
  Whether these belong in the catalog at all is a 2.6 session call.

A trap is stated at **type grain** — no single item's numbers in the
name or the error; the instance lives in "Shows up as."

**209 confirmed traps** across 32 lessons — 168 test · 39 method · 2 check-artifact.

## Cross-lesson families

The same error type extracted independently in two or more lessons —
the entries most worth a shared, tutor-voiced name, and the first
candidates for the pattern catalog and cross-lesson drills. Per-lesson
rows below carry their family in the Trap column.

| Family | Scope | The error type | Appears in |
|---|---|---|---|
| **Answered the wrong quantity** | test | Solves correctly to an intermediate value — k, the change amount, the fitted constant, one member of the pair — and reports it instead of the quantity the question asks for. | Special Right Triangles: Recognize, Scale, Solve; Solve Percent and Percent Change Problems with Desmos; Functions and Function Notation on the SAT; Solve Systems of Equations by Graphing in Desmos |
| **Settles for one solution** | test | Stops after the first root, intersection, or input found, dropping the second real solution. | Solve Equations by Graphing: Find the x-Intercepts; Solve Systems of Equations by Graphing in Desmos; Functions and Function Notation on the SAT; Solve Equations with Regression in Desmos |
| **First match wins** | method | In a test-the-choices strategy, accepts the first choice that fits the evidence without testing the rest, so a coincidence wins. | Use My Numbers to Make Abstract SAT Problems Concrete; Find the Equation with My Numbers |
| **Upgrades the claim** | test | Promotes limited, qualified evidence into a universal or certain claim — some becomes every, suggested becomes proved, a sample statistic becomes a population fact. | Inference Questions: Make the Smallest Supported Leap; Process and Pre-Answer Reading Comprehension Questions; Good Cop / Bad Cop: Prove Every Reading Answer; CLEAR the Claim: Command of Evidence; Reason Through SAT Survey Questions |
| **Association becomes cause** | test | Converts co-occurrence, timing, or an observed difference into a causal claim the text never makes. | Inference Questions: Make the Smallest Supported Leap; Good Cop / Bad Cop: Prove Every Reading Answer; Process and Pre-Answer Reading Comprehension Questions; Rhetorical Synthesis: Let the Goal Lead |
| **Ratio built upside down** | test | Builds a ratio, proportion, percent, or probability with the parts in the wrong order or direction. | Use Scale Factors with Similar Shapes; Recognize and Use Similar Triangles; Right Triangle Trigonometry with SOHCAHTOA; Solve Percent and Percent Change Problems with Desmos; Find Probability from Tables: Favorable over Total; Special Systems: No Solution and Infinitely Many Solutions |
| **Input and output swapped** | test | Reverses which number is the input and which the output — coordinates, function notation, or table roles. | Solve Systems of Equations by Graphing in Desmos; Functions and Function Notation on the SAT; Solve Equations by Graphing: Find the x-Intercepts; Find a Standard Regression Equation from Data |
| **Quits factoring early** | test | Stops while a factorable piece remains — after the GCF, with a common factor still inside a binomial, or with a smaller-than-greatest factor pulled. | Advanced Factoring: Non-Monic Trinomials and Cubes; Factor Polynomials: Trinomials and Difference of Squares; Factor Out the Greatest Common Factor |
| **Choices steer the reading** | test | Opens the answer choices before building meaning from the text, letting an attractive choice interpret the passage. | Solve Words in Context with Read, Predict, Match; Process and Pre-Answer Reading Comprehension Questions |
| **Stand-in never translated back** | method | Solves with renamed variables (Desmos x/y or uppercase X) and never maps the result back to the problem's own letters — entering-side slips have real consequences; reporting-side slips are mostly artifacts of our checks. | Solve Systems of Equations by Graphing in Desmos; Solve Equations by Graphing: Find the x-Intercepts; Solve Equations with Regression in Desmos |

## Algebra

### Find the Equation with My Numbers

_Skill: Algebra – linear equations in context (test-the-choices strategy) · spec: `find-the-equation-with-my-numbers.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Translating by word order** | test | Converts phrases like '7 fewer than' or a per-minute rate left-to-right, attaching the operation or coefficient to the wrong variable. | s=f+6 for '6 fewer shrubs than flowers'; t=12v for 12 liters per minute; b=0.35h for 35% hardcover | `driver_check`, `direction_check`, `rate_check`, `percent_check` | confirmed (2026-08-26) |
| **Free-picking a forced value** | method | Chooses every variable's number independently instead of picking one driver and letting the story compute the linked values. | any convenient p after choosing s=20, instead of the forced p=13 | `process_check`, `driver_check`, `final_retrieval` | confirmed (2026-08-26) |
| **New numbers for each choice** | method | Tests different value sets on different answer choices, letting a wrong equation get rescued by friendlier evidence. | choice B checked with fresh values after choice A failed | `process_check`, `same_values_check`, `retest_check`, `final_retrieval` | confirmed (2026-08-26) |
| **Stopping at the first match**<br>_family: First match wins_ | method | Quits testing as soon as one equation works, never discovering that another choice also matches the same values. | the first true equation, even when a tie exists | `process_check`, `final_retrieval` | confirmed (2026-08-26) |
| **Breaking ties without new evidence** | method | Resolves a two-way tie by appearance (shorter equation) or by tweaking values per choice, instead of building a full second legal value set from the story. | picking the equation with fewer symbols, or re-rounding the same numbers | `collision_action_check`, `retest_check` | confirmed (2026-08-26) |
| **Swapping the rate and fee** | test | Puts the flat fee where the per-unit rate belongs and vice versa (or swaps two unit prices between their quantities). | t=13w+2.5 instead of t=2.5w+13; C=75n+12.5; r=18s+11a | `first_exploration_check`, `museum_equation_check`, `multi_step_equation_check`, `independent_transfer` | confirmed (2026-08-26) |
| **Fee inside the parentheses** | test | Adds the flat fee to the variable before multiplying, so the per-unit rate wrongly distributes over the fee. | C=12.5(n+75) instead of C=12.5n+75; c=8(m+15) | `first_exploration_check`, `multi_step_equation_check`, `independent_transfer` | confirmed (2026-08-26) |
| **Merging rate and fee** | test | Adds the per-unit rate and the flat fee into one combined coefficient on the variable. | C=87.5n; c=23m; r=29(a+s) | `first_exploration_check`, `museum_equation_check`, `independent_transfer` | confirmed (2026-08-26) |

### Rates in Two-Variable Equations: Read the Units

_Skill: Algebra – interpreting linear equations in two variables · spec: `rates-and-units-in-two-variable-equations.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Term read as its variable** | test | Assigns the variable's definition to the whole product, so the term is read as a count of items. | 4n called "the number of large bottles"; 5n called "the number of notebooks sold." | `opening_check`, `two_term_term_check`, `term_interpretation_check` | confirmed (2026-08-26) |
| **Variable inflated to the total** | test | Reads the lone variable as carrying the full term's meaning. | r in 12r called "the total number of students"; h in 8h called "the total liters in all 8 tanks." | `product_anatomy_check`, `variable_can_be_rate_check`, `variable_interpretation_check` | confirmed (2026-08-26) |
| **Coefficient read as a count** | test | Treats the per-item rate coefficient as a quantity of items or as the term's total. | 16 in 16d called "the number of gold tokens won" or "the total points from gold tokens." | `coefficient_interpretation_check` | confirmed (2026-08-26) |
| **Rate must be the coefficient** | test | Never considers that the variable can carry the per-unit rate while the coefficient carries the quantity. | p in 5p called "the number of hectares" when 5 already is the hectares and p is trees per hectare. | `variable_interpretation_check`, `variable_can_be_rate_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Subtotal crowned grand total** | test | Reads one term as the combined total of everything in the equation. | 7.25l called "the combined revenue from both carton sizes"; 4n called "the total liters in all bottles." | `two_term_term_check`, `term_interpretation_check`, `whole_equation_check` | confirmed (2026-08-26) |
| **Units added instead of multiplied** | test | Adds or divides mismatched units, or attaches the rates to the wrong variables, instead of pairing each rate with its matching quantity. | 18+7 = 25 pages; x/12 + y/8 = 300; 12y + 8x = 300. | `unit_chain_check`, `build_equation_check` | confirmed (2026-08-26) |
| **Per-interval read as per-minute** | test | Applies a per-interval rate (per 20 minutes) to every minute or every hour without converting. | 70*120 = 8400 meters instead of 70*6 = 420. | `interval_rate_check` | confirmed (2026-08-26) |

### Solve Equations with Regression in Desmos

_Skill: Algebra – solving equations and systems (Desmos regression) · spec: `solving-equations-with-regression.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Lowercase x has a job** | method | Uses lowercase x (or y) as the regression variable even though those letters already have graphing roles in Desmos. | 4x-9~23 instead of 4X-9~23 | `variable_choice_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Reporting X instead of x**<br>_family: Stand-in never translated back_ | check-artifact | Solves with the stand-in uppercase X and reports it verbatim without translating back to the problem's variable. | X=6 as the final answer instead of x=6 | `practice_single_equation` | confirmed (2026-08-26) |
| **One result means only solution**<br>_family: Settles for one solution_ | test | Treats the single value regression returns as the complete solution set, ruling out other roots Desmos never reported. | z=5 is the only solution of z^2=25; (7,6) is invalid because regression showed (6,7) | `multiple_solution_limit_check`, `transfer_result_check`, `practice_method_choice`, `final_retrieval_check` | confirmed (2026-08-26) |
| **RMSE read as the answer** | method | Interprets a tiny RMSE like 2.1x10^-13 as the variable's value or as a solution count instead of near-zero fit error. | the variable equals 2.1x10^-13, or the equation has 13 solutions | `rmse_check` | confirmed (2026-08-26) |
| **Restricts the wrong object** | method | When directed to the other root, aims the negative sign or the restriction at the constant — or keeps the wrong-direction restriction — instead of restricting the variable. | w^2~-64 or w^2~64 {w>0} instead of w^2~64 {w<0} | `restriction_check`, `practice_restricted_solution` | confirmed (2026-08-26) |
| **Two tildes for one system** | method | Enters both equations of a system as regressions instead of one definition plus exactly one regression line. | p+q~14 and p^2+q^2~106 | `system_setup_check`, `regression_line_choice_check`, `define_once_check`, `practice_system_setup`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Constraint never isolated** | method | Leaves the easy equation as written (p+q=14) instead of rearranging it into a definition with one variable alone on the left. | p+q=14 typed as-is next to the regression line | `definition_check`, `system_setup_check`, `define_once_check`, `regression_line_choice_check` | confirmed (2026-08-26) |
| **Defining a variable twice** | method | Gives the same variable two definition lines by solving both equations for it. | m=11-n and m=sqrt(61-n^2) entered together | `define_once_check`, `system_setup_check`, `regression_line_choice_check`, `practice_system_setup` | confirmed (2026-08-26) |

### Solve Systems of Equations by Graphing in Desmos

_Skill: Algebra – Systems of two linear equations in two variables · spec: `solving-systems-of-equations-by-graphing.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Reads the point backwards**<br>_family: Input and output swapped_ | test | Swaps the coordinates of the intersection, reporting the y-value as x and vice versa. | x=5, y=2 for the intersection (2,5) | `first_observation_check`, `equation_graph_meaning_check`, `first_system_solution_check`, `first_gated_solution_check`, `different_variables_answer_check` | confirmed (2026-08-26) |
| **Half the ordered pair** | test | Treats a single coordinate as the whole solution instead of the complete x-and-y pair. | x=2 only, as the solution of the system | `intersection_meaning_check`, `first_system_solution_check` | confirmed (2026-08-26) |
| **Stops at the first intersection**<br>_family: Settles for one solution_ | test | Assumes a system has exactly one solution, so the second crossing of a line-parabola system never gets clicked. | q=3 only, when the intersections give q=3 and q=8 | `nonlinear_count_check`, `nonlinear_points_check`, `transfer_answer_check` | confirmed (2026-08-26) |
| **Forgets to translate the variables**<br>_family: Stand-in never translated back_ | method | Maps the original variables onto x and y inconsistently, or reports Desmos's x and y instead of the question's own letters. | 3y-2x=7 entered for 3a-2b=7, or answering y=3 when the question asks for b | `different_variables_mapping_check`, `different_variables_answer_check` | confirmed (2026-08-26) |
| **Answers the pair, not question**<br>_family: Answered the wrong quantity_ | test | Reads the intersection correctly but reports the wrong requested quantity — x when asked for y, or the subtraction in the wrong order. | 4 instead of -4 for x-y at (2,6) | `requested_quantity_check`, `first_gated_solution_check` | confirmed (2026-08-26) |
| **Rearranges before graphing** | method | Believes Desmos needs y isolated or the system simplified by hand, or reflexively sets y to zero, instead of entering both full equations. | eliminating y by hand first, or replacing y with zero and reading x-intercepts | `no_simplifying_check`, `final_retrieval_check` | confirmed (2026-08-26) |

### Special Systems: No Solution and Infinitely Many Solutions

_Skill: Algebra – Systems of two linear equations in two variables · spec: `special-systems-no-solution-and-infinitely-many.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Forgets to check the constants** | test | Declares infinitely many solutions as soon as the x- and y-coefficients are proportional, without testing whether the constants share the same ratio. | calling 6x+9y=12 and 10x+15y=25 infinitely many because 10/6=15/9 | `proportion_no_solution_check`, `multiple_constants_no_solution_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Misses the disguised same line** | test | Fails to divide out a shared factor, so a scaled copy of an equation reads as a different parallel line. | picking y=x+7 and 2y=2x+14 as a no-solution system | `no_solution_rule_check`, `infinite_solution_observation_check` | confirmed (2026-08-26) |
| **Copies a number without scaling** | test | Carries a coefficient or constant straight across to the other equation instead of applying the system's scale factor first. | b=8 read straight off 2y=6x+8 instead of b=4, or n=6 instead of n=15 | `slider_infinite_check`, `proportion_missing_coefficient_check`, `multiple_constants_infinite_check` | confirmed (2026-08-26) |
| **Matches the wrong number** | test | Sets the missing value equal to a visible intercept when the slopes must match, or to a slope when the intercepts must match. | a=1 (the y-intercept) instead of a=2 to make y=ax+1 parallel to y=2x-3 | `slider_no_solution_check`, `slider_infinite_check`, `multiple_constants_no_solution_check` | confirmed (2026-08-26) |
| **Swaps the two special conditions** | test | Mixes up which slope-intercept combination gives no solution versus infinitely many solutions. | a=4 and c=15 (the same-line condition) chosen as the no-solution condition | `special_systems_contrast_check`, `multiple_constants_no_solution_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Builds the ratio from wrong pieces**<br>_family: Ratio built upside down_ | test | Forms the within-equation proportion from the constants instead of the coefficients, or inverts the ratio. | p/q = 2/5 or 5/2 instead of 15/25 = 3/5 | `within_equation_ratio_check` | confirmed (2026-08-26) |

### Use My Numbers to Make Abstract SAT Problems Concrete

_Skill: Algebra – equivalent expressions in context (plug-in-values strategy) · spec: `my-numbers-strategy.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Stopping at the first match**<br>_family: First match wins_ | method | Takes the first expression that hits the target number and never tests the rest, so a one-input coincidence wins. | w^2+12, which equals the perimeter only at w=4 | `collision_response_check`, `rerun_check`, `final_retrieval` | confirmed (2026-08-26) |
| **Mishandling a two-choice tie** | method | When two choices match, concludes both are correct, averages them, or abandons the strategy instead of retesting with a new legal value. | declaring both tied choices correct, or the longer one | `collision_check`, `collision_response_check` | confirmed (2026-08-26) |
| **Checking only one constraint** | method | Picks values that satisfy one stated condition (like the ratio) while breaking another (positivity or order). | a=2, b=4 or a=-3, b=-1 when a>b>0 and a/b=3 are required | `constraints_check` | confirmed (2026-08-26) |
| **Overriding a forced relationship** | method | Picks the second variable freely even though a given ratio or equation forces it from the first pick. | any x after choosing y=2, instead of x=6 forced by x/y=3 | `ratio_process_check`, `same_values_check`, `final_retrieval` | confirmed (2026-08-26) |
| **Switching values between choices** | method | Tests each answer choice against a different value set instead of one fixed concrete situation. | a new m, or a drifting n, for every choice | `same_values_check`, `final_retrieval` | confirmed (2026-08-26) |
| **Plugging into a solve-for-x problem** | method | Invents values for a variable that already has one determined value, which changes the problem instead of testing it. | choosing your own x in 4x-7=21 | `recognition_check`, `when_not_check` | confirmed (2026-08-26) |
| **Half the perimeter, or area** | test | Computes one width plus one length (or width times length) instead of the full perimeter 2w+2l. | 14 or 40 for a 4-by-10 rectangle's perimeter of 28; expressions like 2w+6 or 3w+3 | `first_value_check`, `rerun_check`, `relative_geometry_check` | confirmed (2026-08-26) |
| **Losing the original group** | test | With 'three times as many standard as premium,' counts only the 3p standard tickets for the total, or adds the 3 as a raw number. | 3p or p+3 instead of 4p for the total | `word_problem_check`, `independent_transfer_check` | confirmed (2026-08-26) |

## Advanced Math

### Advanced Factoring: Non-Monic Trinomials and Cubes

_Skill: Advanced Math – Equivalent expressions · spec: `advanced-factoring-non-monic-trinomials-and-cubes.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Ignores the cross-product sum** | test | Picks binomials whose first and last terms multiply correctly but never adds the two cross-products to confirm the middle term. | a pairing like (6x+1)(x+3), whose cross-products give 19x instead of 11x | `reverse_multiplication_check`, `general_structure_check`, `cross_products_check`, `multiple_pairs_check`, `mixed_transfer_non_monic_two` | confirmed (2026-08-26) |
| **Minus lands on wrong binomial** | test | Places the negative constant in the wrong factor, so the cross-products produce the middle term with the opposite sign. | (3x+2)(2x-1) for 6x^2-x-2, which expands to +x instead of -x | `negative_constant_check`, `mixed_transfer_non_monic_one`, `mixed_transfer_non_monic_two` | confirmed (2026-08-26) |
| **Leaves a GCF inside a binomial**<br>_family: Quits factoring early_ | test | Accepts a factorization in which one binomial still has its own common factor, so the product is wrong or the factoring incomplete. | (6x+3)(x+1) for 6x^2+11x+3, or (4x+8)(x^2-2x+4) | `multiple_pairs_check`, `gcf_non_monic_check`, `mixed_transfer_non_monic_one`, `gcf_cubes_check`, `mixed_transfer_cubes` | confirmed (2026-08-26) |
| **Stops after pulling the GCF**<br>_family: Quits factoring early_ | test | Removes the GCF and quits, never checking whether the leftover trinomial or cubes expression still factors. | 2(6x^2+13x+5) or 4(x^3+8) offered as complete factorizations | `gcf_non_monic_check`, `gcf_cubes_check`, `mixed_transfer_cubes` | confirmed (2026-08-26) |
| **Copies the sign into quadratic** | test | In the cube identities, gives the quadratic factor's middle term the same sign as the binomial instead of the opposite sign. | (x-3)(x^2-3x+9) for x^3-27, or (2x+5)(4x^2+10x+25) for 8x^3+125 | `cube_identity_check`, `difference_of_cubes_check`, `sum_of_cubes_check`, `multivariable_cubes_check`, `mixed_transfer_cubes` | confirmed (2026-08-26) |
| **Flips the binomial's sign** | test | Changes the sign of the binomial factor even though it must keep the original sum-or-difference sign. | (x+3)(x^2-3x+9) for x^3-27, or (2x-5)(...) for 8x^3+125 | `difference_of_cubes_check`, `sum_of_cubes_check`, `multivariable_cubes_check` | confirmed (2026-08-26) |
| **Skips taking the cube roots** | test | Builds the factors from the original coefficients, or square-roots them, instead of taking actual cube roots (and dividing exponents by 3). | (8x+125)(x^2-x+1), or cube roots reported as 8x^3 and 25y instead of 4x^2 and 5y | `cube_roots_check`, `sum_of_cubes_check`, `multivariable_cubes_check` | confirmed (2026-08-26) |
| **Treats cubes like squares** | test | Applies the difference-of-squares shape to a cubes expression, or misidentifies which pattern remains after the GCF. | (x-3)(x^2+9) for x^3-27, or A^3-B^3=(A-B)(A^2-B^2) | `cube_identity_check`, `difference_of_cubes_check`, `method_selection_check` | confirmed (2026-08-26) |

### Factor Out the Greatest Common Factor

_Skill: Advanced Math – Equivalent expressions · spec: `factor-out-greatest-common-factor.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Settles for a smaller factor**<br>_family: Quits factoring early_ | test | Factors out a number or power that divides every term but is not the greatest, leaving a common factor inside the parentheses. | 4x(6x+9) or 6x(4x+6) instead of 12x(2x+3) | `group_observation_check`, `numerical_gcf_check`, `complete_gcf_check`, `mixed_numeric_part_check`, `mixed_gcf_check`, `three_term_check`, `independent_transfer_one`, `multiple_variable_check` | confirmed (2026-08-26) |
| **Grabs the biggest exponent** | test | Uses the largest exponent of a shared variable (or the sum of the exponents) for the GCF, over-stripping terms and leaving variable-free husks. | x^5 or m^4n^5 as the shared power, or leftovers like 6m^4n^5(3-4) | `shared_exponent_check`, `variable_only_check`, `mixed_variable_part_check`, `multiple_variable_parts_check`, `mixed_gcf_check`, `multiple_variable_check`, `independent_transfer_one`, `independent_transfer_two` | confirmed (2026-08-26) |
| **Divides only one term** | test | Applies the GCF division to a single term, or subtracts the GCF instead of dividing, copying the other terms unchanged. | 7(3x+28) or 7(14x+28) instead of 7(3x+5) for 21x+35 | `quotient_check`, `final_retrieval` | confirmed (2026-08-26) |
| **Negative GCF, unflipped signs** | test | Takes out a negative GCF but fails to reverse the sign of every quotient inside the parentheses. | -10x^2(2x-3) instead of -10x^2(2x+3) for -20x^3-30x^2 | `negative_gcf_check`, `independent_transfer_two` | confirmed (2026-08-26) |

### Factor Polynomials: Trinomials and Difference of Squares

_Skill: Advanced Math – Equivalent expressions · spec: `factoring-polynomials-gcf-trinomials-difference-of-squares.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Right product, wrong sum** | test | Grabs any factor pair of the constant without checking that the pair also adds to the middle coefficient, or swaps the sum and product roles entirely. | (x+4)(x+6) for x^2+11x+24, since 4*6=24 but 4+6=10 | `middle_constant_relationship_check`, `pair_search_check`, `guided_positive_pair_check`, `guided_positive_factor_check`, `transfer_three` | confirmed (2026-08-26) |
| **Right pair, wrong signs** | test | Finds the correct number pair but assigns signs that contradict the middle term — both positive when both must be negative, or the minus on the wrong factor. | (x+3)(x+7) for x^2-10x+21, or (x+5)(x-3) for x^2-2x-15 | `pair_search_check`, `negative_middle_check`, `opposite_signs_check`, `transfer_three` | confirmed (2026-08-26) |
| **Half a square root** | test | Takes the square root of the coefficient but not the exponent (or vice versa) when setting up a difference of squares. | square roots 7x and 9 for 49x^4-81, or (81m^2-16n^3)(m^2+n^3) | `square_roots_check`, `difference_check`, `multiple_variables_check` | confirmed (2026-08-26) |
| **Conjugates vs squared binomial** | test | Writes a squared binomial for a difference of squares, or conjugate factors for a perfect-square trinomial. | (5x-8)^2 for 25x^2-64, or 3x(x+3)(x-3) instead of 3x(x+3)^2 | `difference_check`, `multiple_variables_check`, `transfer_one`, `transfer_two` | confirmed (2026-08-26) |
| **Factors a sum of squares** | test | Sees two perfect squares and applies the conjugate pattern even though the terms are added, not subtracted. | picking x^2+36 as factorable by difference of squares | `sum_warning_check`, `method_selection_check` | confirmed (2026-08-26) |
| **Quits before factoring completely**<br>_family: Quits factoring early_ | test | Stops after removing the GCF, or skips the GCF-first step entirely, leaving an inner factor that still factors. | 3x(x^2+6x+9) or (2a-3b)(10a+15b) as final answers | `transfer_one`, `transfer_two`, `retrieval_check` | confirmed (2026-08-26) |

### Find a Standard Regression Equation from Data

_Skill: Advanced Math – linear, quadratic, and exponential models from data (Desmos regression) · spec: `standard-regression-from-data.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Coordinates in backwards columns**<br>_family: Input and output swapped_ | method | Puts y-values in the left table column and x-values in the right, reversing input and output roles. | rows like (96,0),(48,1),(24,2) for g(0)=96, g(1)=48, g(2)=24 | `point_source_check`, `graph_points_check`, `function_roles_check`, `function_points_check`, `transfer_points_check` | confirmed (2026-08-26) |
| **Model picked by vibes** | test | Chooses linear because the values increase, or quadratic because there are four points, instead of checking whether outputs add a fixed amount or multiply by a fixed factor. | a linear fit like g(t)=48t+96 for data that doubles or halves | `model_type_check`, `guided_exponential_result`, `transfer_model_check` | confirmed (2026-08-26) |
| **Swapping start value and factor** | test | Writes the exponential with the growth factor in the initial-amount slot and vice versa. | g(t)=0.5(96)^t instead of g(t)=96(0.5)^t; B(t)=1.5(80)^t | `guided_exponential_result`, `transfer_model_check` | confirmed (2026-08-26) |
| **Misreading the fitted equation** | method | Copies the displayed equation with a dropped negative sign or with slope and intercept in swapped slots. | y=2x+9 or y=9x-2 instead of y=-2x+9; y=x^2+4x+1 instead of y=x^2-4x+1 | `first_result_check`, `guided_linear_result`, `quadratic_result_check` | confirmed (2026-08-26) |
| **Renumbering the time column** | method | Enters the inputs as 0,1,2 out of habit when the data points are actually at t=0,2,4. | rows (0,80),(1,180),(2,405) instead of (0,80),(2,180),(4,405) | `transfer_points_check` | confirmed (2026-08-26) |
| **Reflecting across the wrong line** | test | When building a third quadratic point by symmetry, reflects across the y-axis or flips the y-value instead of reflecting across the vertex line. | (-5,6) or (-1,-6) instead of (-1,6) for vertex x=2 and point (5,6) | `symmetric_point_check` | confirmed (2026-08-26) |
| **Hand-tweaking instead of Regression** | method | Types y=ax^2+bx+c on a line and adjusts coefficients until the graph looks close, rather than clicking the table's Regression button and picking a model. | guess-and-check coefficients that merely look right | `button_sequence_check`, `final_retrieval_check` | confirmed (2026-08-26) |

### Find Missing Constants with Custom Regression

_Skill: Advanced Math – nonlinear functions with unknown constants (Desmos custom regression) · spec: `custom-regression-from-data.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Equals sign instead of tilde** | method | Types the model with = instead of ~, so Desmos treats it as a fixed equation rather than fitting the constants. | y1=c(x1-3)^2+8 as the regression line | `regression_symbol_check`, `special_exponential_setup_check`, `transfer_setup_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Keeping the problem's letters** | method | Leaves the original variables like P(n), N(t), or plain x and y in the regression instead of translating to the table variables x1 and y1. | P(n)~c(n-4)^2+7 or y~c(x-4)^2+7 | `table_variable_translation_check`, `regression_symbol_check`, `multiple_function_check`, `special_exponential_setup_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Swapping x1 and y1** | method | Puts the table's output where the input belongs, writing the regression as x1~ (expression in y1). | x1~c(y1-4)^2+7 | `table_variable_translation_check`, `regression_symbol_check`, `function_mapping_check`, `multiple_function_check`, `transfer_setup_check` | confirmed (2026-08-26) |
| **Typing the constraint as given** | method | Enters a relationship like p+q=18 verbatim (or with ~) instead of isolating one constant as a definition like p=18-q. | p+q=18 or p+q~18 on its own line; A~200 instead of A=200 | `definition_check`, `special_exponential_setup_check`, `transfer_setup_check` | confirmed (2026-08-26) |
| **Reading the wrong constant** | method | Reports a number already printed in the model or the givens (the vertex shift, the constant term, the sum in a relationship) instead of the value Desmos actually assigned. | a=5 or a=2 when the model is a(t-2)^2+5 and Desmos assigned a=3 | `first_custom_result_check`, `guided_function_constant_check`, `guided_definition_result_check` | confirmed (2026-08-26) |
| **Growth factor is not the rate** | test | Reads the fitted 1+r=1.10 and reports the whole factor as the rate. | r=1.10, so 110% growth, instead of r=0.10 = 10% | `special_exponential_result_check` | confirmed (2026-08-26) |
| **Swapping which letter got which** | method | Attaches the two fitted constants to the wrong letters when writing the final equation. | u=2, v=4 instead of u=4, v=2; H(t)=2(t-1)^2+4 | `transfer_constants_check`, `transfer_equation_check` | confirmed (2026-08-26) |
| **Standard button for a required form** | method | Runs the standard Regression dropdown when the question demands a specific form (like vertex form with named constants), then tries to rename its coefficients. | the built-in quadratic fit with its a, b, c relabeled to match the question | `custom_recognition_check`, `final_retrieval_check` | confirmed (2026-08-26) |

### Functions and Function Notation on the SAT

_Skill: Advanced Math – Nonlinear functions · spec: `functions-and-function-notation.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Scrambles input and output**<br>_family: Input and output swapped_ | test | Reverses which number is the input when translating between f(a)=b and a point, often dragging a negative sign onto the wrong coordinate. | (9,-4) or (4,-9) as the point for p(-4)=9, or q(-2)=5 for the point (5,-2) | `notation_definition_check`, `notation_to_point_check`, `point_to_notation_check`, `notation_decision_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Reads f(3) as f times 3** | test | Treats function notation as multiplication between the function name and the input. | the product of g and -2, for g(-2) | `notation_definition_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Checks outputs, not inputs** | test | Tests whether a relation is a function by scanning for repeated outputs, missing the input that appears with two different outputs. | accepting {(1,2),(1,5),(3,7)} as a function, or rejecting a set where two inputs share output 4 | `function_definition_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Echoes the given number** | test | Answers with the number the problem already supplied — the target output handed back as an input, or the input echoed as the output. | x=7 for f(x)=7, or f(3)=3 read straight from the prompt | `first_observation_check`, `solve_function_equation_check`, `graph_evaluation_check` | confirmed (2026-08-26) |
| **Misses the second input**<br>_family: Settles for one solution_ | test | Stops at one x-value when a quadratic graph reaches the target output twice. | x=2 only, for x^2+3=7 | `solve_function_equation_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Substitutes into the wrong slot** | test | When the input is itself a constant or expression, replaces the wrong letter, or collapses b*b into 2b. | 2b+4 or b+4 instead of b^2+4 for g(b) with g(x)=bx+4 | `missing_constant_substitution_check` | confirmed (2026-08-26) |
| **Puts the tilde on definition** | method | In Desmos missing-constant setups, swaps = and ~, turning the function definition itself into the regression row. | f(x) ~ ax^2+5 with f(a)=13, instead of f(x)=ax^2+5 with f(a) ~ 13 | `regression_setup_check`, `common_mistakes_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Stops before the asked expression**<br>_family: Answered the wrong quantity_ | test | Finds the constant, or an intermediate power of it, and reports that instead of the expression the question actually requests. | 6 (which is 2c) instead of 7 (which is 2c+1), or a=8 from a^3=8 instead of a=2 | `requested_expression_check`, `regression_result_check` | confirmed (2026-08-26) |

### Solve Equations by Graphing: Find the x-Intercepts

_Skill: Advanced Math – Nonlinear equations in one variable · spec: `solving-equations-by-graphing-x-intercepts.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Moves a term, keeps sign** | test | When collecting everything on one side, adds the moved term instead of subtracting it, or forgets to move it at all. | graphing 2x^2+7x+5 (or 2x^2+5) instead of 2x^2-7x+5 for 2x^2+5=7x | `rewrite_check` | confirmed (2026-08-26) |
| **Flips the signs of roots** | test | Reports each intercept with the opposite sign — the classic slip of reading roots -2 and -3 from factors (x-2)(x-3). | x=-3 and x=-2 for x^2-5x+6=0 | `exploration_check`, `practice_one_answer`, `different_variable_check` | confirmed (2026-08-26) |
| **Grabs the y-number, not x**<br>_family: Input and output swapped_ | test | Reads y-intercepts, or the 0 in (a,0), instead of the x-coordinate of each x-intercept. | (0,2) and (0,3), or answering 0 because the point sits on the axis | `exploration_check`, `x_axis_check`, `x_intercept_check`, `full_model_check`, `viewport_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Keeps the stand-in x**<br>_family: Stand-in never translated back_ | check-artifact | Uses x as a temporary variable in Desmos but never translates the answer back to the equation's own letter. | x is approximately -2.1 and 1.6 when the equation was in r | `different_variable_check`, `practice_two_answer` | confirmed (2026-08-26) |
| **Reports only one intercept**<br>_family: Settles for one solution_ | test | Stops after the first, larger, or positive intercept and drops the second real solution. | only r is approximately -2.1, or x=7/2 only when the answer is plus-or-minus sqrt(7) | `full_model_check`, `exact_choice_check`, `practice_two_answer` | confirmed (2026-08-26) |
| **Matches the exact form by shape** | method | Picks the lookalike exact form (same digits, different structure) instead of verifying which choice evaluates to the decimal the graph gave. | x = plus-or-minus 7 instead of plus-or-minus sqrt(7), or (-5+-sqrt(97))/6 instead of (5+-sqrt(97))/6 | `exact_choice_check`, `transfer_exact_check` | confirmed (2026-08-26) |
| **Miscounts solutions from the graph** | test | Counts a touch point as two solutions, assumes every quadratic has two, or declares no real solution without panning or zooming the window. | (x-3)^2=0 has two solutions, or no solution declared straight from a cramped window | `solution_count_check`, `viewport_check`, `practice_three_answer` | confirmed (2026-08-26) |
| **Reads roots off the coefficients** | test | Plucks the equation's own numbers as the solutions instead of graphing and reading intercepts. | t=0 and t=5 for t^2-5t+4=0, or x=1 and x=6 for x^2-5x+6=0 | `different_variable_check`, `practice_one_answer`, `practice_two_answer` | confirmed (2026-08-26) |

## Problem-Solving and Data Analysis

### Find Probability from Tables: Favorable over Total

_Skill: Problem-Solving and Data Analysis – conditional probability from two-way tables · spec: `probability-from-tables-favorable-over-total.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Grand total ignores the given** | test | Keeps the whole-table total in the denominator even though "given that" restricts the selection to one row or column. | 18/70 instead of 18/30; 39 over the grand total of 100 instead of 39/65. | `given_total_check`, `favorable_within_check`, `denominator_trap_check`, `transfer_total_check`, `transfer_given_probability_check`, `final_retrieval` | confirmed (2026-08-26) |
| **Target group became the total** | test | Restricts the denominator by the favorable category instead of the condition after "given that." | 39/60 (science column total) instead of 39/65 (adult row); 18/32 instead of 18/30. | `denominator_trap_check`, `reverse_direction_check`, `transfer_total_check`, `transfer_given_probability_check`, `given_total_check` | confirmed (2026-08-26) |
| **Favorable over Total flipped**<br>_family: Ratio built upside down_ | test | Puts the group size on top and the favorable count on the bottom. | 40/24 or 25/9 — a "probability" bigger than 1. | `formula_terms_check`, `favorable_within_check`, `missing_total_check`, `final_retrieval` | confirmed (2026-08-26) |
| **Invented a given** | test | Restricts to a single row or column when the selection is actually from the whole table. | 18/30 (one grade's row) when the answer is 32/70 over all students. | `without_given_check`, `transfer_no_given_check` | confirmed (2026-08-26) |
| **Grabbed the neighboring cell** | test | Uses the right restricted total but counts the complementary category inside it. | 16/40 (nonfiction) instead of 24/40 (fiction); 26/65 (history adults) instead of 39/65. | `given_total_check`, `favorable_within_check`, `reverse_direction_check`, `transfer_given_probability_check` | confirmed (2026-08-26) |
| **Cell mistaken for a total** | test | Treats a single intersection cell as the whole group, especially when the table omits its total row or column. | 9/16 (the other cell as denominator) instead of 9/25 (16+9 added first). | `exploration_check`, `table_totals_check`, `missing_total_check` | confirmed (2026-08-26) |

### Reason Through SAT Survey Questions

_Skill: Problem-Solving and Data Analysis – sampling, surveys, and margin of error · spec: `surveys-sampling-and-margin-of-error.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Sample percent becomes population fact**<br>_family: Upgrades the claim_ | test | Treats the sample statistic as the exact value for the whole population. | "Exactly 64% of every student at the school supports the schedule." | `terms_check`, `supported_statement_check`, `unsupported_statement_check`, `range_certainty_check`, `model_check`, `transfer_statement_check` | confirmed (2026-08-26) |
| **Claim outgrows the sample list** | test | Generalizes beyond the group the sample was actually drawn from, dropping a restriction like grade level or location. | An eleventh-grade district sample stretched to "all students in the district" or the whole state. | `largest_population_check`, `supported_statement_check`, `model_check`, `transfer_scope_check`, `transfer_statement_check` | confirmed (2026-08-26) |
| **Results locked to respondents** | test | Refuses to generalize at all, limiting the conclusion to the surveyed individuals. | "Only the 300 students who responded." | `largest_population_check`, `transfer_scope_check` | confirmed (2026-08-26) |
| **Margin of error as guarantee** | test | Treats the plus/minus interval as hard bounds the true value cannot escape. | "The true population value must be between 58% and 66%." | `range_certainty_check`, `model_check`, `final_retrieval` | confirmed (2026-08-26) |
| **One-sided margin of error** | test | Adds or subtracts the margin only once, or anchors the interval at the margin itself instead of going both ways from the statistic. | 71% to 77% (added only), or 5% to 46%, instead of 65% to 77%. | `range_check`, `transfer_range_check` | confirmed (2026-08-26) |
| **Big sample cures bias** | test | Believes a large sample count fixes a self-selected or biased collection method. | "10,000 voluntary responses guarantee the poll represents the population." | `bias_vs_precision_check`, `reduce_margin_check` | confirmed (2026-08-26) |
| **Volunteers look random enough** | test | Accepts convenience or self-selected groups — one location, optional polls, insiders — as representative samples. | "Post an optional poll on social media" or "ask the first 100 students at the library" chosen as sound designs. | `exploration_check`, `bias_check` | confirmed (2026-08-26) |

### Solve Percent and Percent Change Problems with Desmos

_Skill: Problem-Solving and Data Analysis – percentages and percent change · spec: `percentages-and-percent-change.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Percent based on the new value** | test | Uses the new amount as the percent base — dividing the change by New, or writing p% of New in the template — instead of the old value after of/than. | 17.6% for a drop from 80 to 68; 63~90-p% of 63 | `decrease_result_check`, `than_basis_check`, `less_than_translation_check`, `complex_setup_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Difference reported as percent** | test | Reports the raw difference or the part itself as the percent without ever dividing by the base. | 12% for a drop from 80 to 68; 48% for '48 is what percent of 60' | `exploration_check`, `decrease_result_check`, `guided_percent_result`, `practice_basic_result` | confirmed (2026-08-26) |
| **Dividing the wrong way**<br>_family: Ratio built upside down_ | test | Swaps part and base, computing base/part, so the percent lands over 100 when it should be under (or vice versa). | 125% instead of 80% for 48 out of 60; 48~X% of 36 | `exploration_check`, `percent_of_check`, `regression_variable_check`, `guided_percent_result`, `practice_basic_result` | confirmed (2026-08-26) |
| **Decimal moved wrong distance** | test | Converts a percent to a decimal by moving the point one or three places instead of two. | 0.65 or 0.0065 for 6.5% | `decimal_conversion_check` | confirmed (2026-08-26) |
| **Wrong sign for the direction** | test | Adds when the wording says less than, or subtracts for an increase, flipping the sign in New = Old plus-or-minus p% of Old. | 63~90+p% of 90; $68 for an $80 price increased 15% | `change_direction_check`, `increase_result_check`, `less_than_translation_check` | confirmed (2026-08-26) |
| **Stopping at a middle number**<br>_family: Answered the wrong quantity_ | test | Answers with the change amount or an intermediate variable instead of the quantity the question actually asks for. | $12 (the increase) instead of $92; $35 (the discounted price d) instead of the original $50 | `increase_result_check`, `practice_complex_result` | confirmed (2026-08-26) |
| **Regression rules forgotten for percents** | method | Slips on the regression conventions inside percent templates — lowercase x as the variable, = instead of ~, or ~ on the definition line. | 36~x% of 48; 36=X% of 48; d~b-25% of b as the definition | `regression_variable_check`, `complex_setup_check` | confirmed (2026-08-26) |
| **Tiny RMSE looks like failure** | method | Sees RMSE=1.4x10^-13 and concludes the setup is broken because it is not exactly zero, or reads the RMSE as the percent itself. | the setup must be wrong since RMSE isn't printed as zero | `rmse_check` | confirmed (2026-08-26) |

### Understand and Use Standard Deviation

_Skill: Problem-Solving and Data Analysis – standard deviation · spec: `standard-deviation.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Bigger numbers, bigger spread** | test | Judges standard deviation by the size of the values or the mean instead of distances from the center. | Picks [100,101,102,103,104] as most spread out, or calls two sets equal because their means match. | `spread_observation_check`, `meaning_check`, `center_spread_check`, `conceptual_comparison_check`, `desmos_compare_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Shift moves the spread** | test | Thinks adding or subtracting a constant from every value changes the standard deviation by that amount. | "SD decreases by 7" when every value drops by 7 (it stays the same). | `shift_check`, `center_spread_check` | confirmed (2026-08-26) |
| **Counting values, not distances** | test | Reasons from how many data points remain rather than how far they sit from the center. | "It increases because the set has more values" or "stays the same because the count is unchanged." | `meaning_check`, `replacing_value_check`, `practice_add_near_center`, `practice_remove_center`, `prediction_process_check` | confirmed (2026-08-26) |
| **Endpoints fixed, spread fixed** | test | Treats standard deviation like range — if the minimum and maximum stay put, nothing changed. | "Unchanged because 0 and 10 did not move" after adding or removing the center value 5. | `practice_add_near_center`, `practice_remove_center` | confirmed (2026-08-26) |
| **Any bigger number stretches spread** | test | Judges a replacement by raw size instead of distance from the cluster. | Replacing 20 with 7 "increases SD because 7 > 6" (it decreases — 7 is closer to the cluster). | `replacing_value_check`, `outlier_result_check` | confirmed (2026-08-26) |
| **Mean zero, spread zero** | test | Thinks a symmetric or zero-mean set has zero standard deviation, when zero spread requires identical values. | Picks [-1,0,1] or [0,1,0,1] as the set with SD 0 instead of [6,6,6,6]. | `zero_check`, `practice_add_near_center` | confirmed (2026-08-26) |

### Use Desmos Lists and List Tools

_Skill: Problem-Solving and Data Analysis – statistics with lists (mean, median, total) · spec: `desmos-list-tools.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Parentheses don't make lists** | method | Defines a list with parentheses or loose values, creating a point or a sum instead of a bracketed list. | A=(2,3,4,5) or A=2+3+4+5 instead of A=[2,3,4,5] | `list_syntax_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **A+2 glues on a 2** | method | Thinks scalar arithmetic appends the number as a new element, or changes only one element, instead of transforming every element. | [2,3,4,5,2] or [2,3,4,7] for A+2; [1,3,5,7,1] for join(A,B)+1 | `add_scalar_prediction_check`, `add_scalar_desmos_check`, `multiply_scalar_check`, `square_list_check`, `practice_join_then_transform`, `final_retrieval_check` | confirmed (2026-08-26) |
| **List collapses to one number** | method | Expects a list operation to return a single total rather than an element-by-element list. | B=16 for A+2; 196 for A^2; 66 for A+B | `add_scalar_prediction_check`, `add_scalar_desmos_check`, `square_list_check`, `two_list_arithmetic_check`, `join_result_check`, `practice_join_median` | confirmed (2026-08-26) |
| **join adds, plus concatenates** | method | Swaps the two combiners — expects A+B to string the lists together and join to add matching elements. | [1,2,3,10,20,30] for A+B; [8,12] for join([2,4],[6,8]); mean(P+Q) for a combined mean | `two_list_arithmetic_check`, `join_result_check`, `join_vs_add_check`, `practice_two_groups_mean`, `practice_join_then_transform`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Summarizing groups before combining** | test | Takes each group's mean or median separately and then combines those statistics, instead of joining all the raw values first. | 4 or 5 (each list's own median) instead of 4.5; join(mean(P),mean(Q)) | `practice_two_groups_mean`, `practice_join_median` | confirmed (2026-08-26) |
| **Grabbing the wrong statistic** | test | Reaches for total when mean is asked, or mean when median is asked, since the function names blur together. | 14 for mean([2,3,4,5]); 3.5 for total(A); median(A)+3 for a summed fee problem | `mean_check`, `median_check`, `total_check`, `process_check` | confirmed (2026-08-26) |
| **Planning around repeat()** | method | Builds the test-day plan on repeat(), which the SAT testing calculator does not support. | a repeat()-based setup that works at home but fails on test day | `repeat_warning_check`, `final_retrieval_check` | confirmed (2026-08-26) |

## Geometry and Trigonometry

### Recognize and Use Similar Triangles

_Skill: Geometry and Trigonometry – similar triangles · spec: `similar-triangles.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Matched by name, not marks** | test | Pairs vertices by alphabetical order or page position instead of angle markings or the order in the similarity statement. | AB/DE = BC/DF from triangle ABC ~ triangle DFE, pairing as if it read DEF. | `angle_observation_check`, `aa_recognition_check`, `angle_to_side_check`, `valid_proportion_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **One ratio flipped mid-proportion**<br>_family: Ratio built upside down_ | test | Writes one ratio first-triangle-over-second and the other second-over-first in the same proportion. | x = 22.5 from x/15 = 12/8 instead of x = 10 from x/15 = 8/12. | `valid_proportion_check`, `ordinary_guided_check`, `projection_proportion_check`, `parallel_transfer_check` | confirmed (2026-08-26) |
| **Similarity assumed for free** | test | Declares triangles similar without establishing two matching angle pairs. | "All triangles are similar" or "the altitude divides a triangle into congruent triangles." | `aa_recognition_check`, `right_altitude_aa_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Similar means same size** | test | Treats similar as congruent or orientation-dependent — equal sides, same facing direction. | "Every side in one triangle equals a side in the other." | `definition_meaning_check`, `right_altitude_aa_check` | confirmed (2026-08-26) |
| **Shared side stuck in one role** | test | In the altitude-to-hypotenuse figure, sets the shared side or altitude over itself, missing that it plays a different size role in each triangle. | Degenerate proportions like 9/16 = h/h or 18/8 = x/x. | `projection_proportion_check`, `altitude_setup_check`, `leg_setup_check` | confirmed (2026-08-26) |
| **Skipped the size ranking** | test | Pairs sides without ranking small/medium/large inside each triangle first. | Picks AD = 9 or the hypotenuse AC = 15 as the medium side instead of CD = 12. | `side_rank_check`, `right_altitude_rank_check` | confirmed (2026-08-26) |
| **Added the hypotenuse pieces** | test | Combines the two hypotenuse segments additively instead of cross-multiplying the geometric-mean proportion. | h = 13 (from 4+9) or sqrt(13) instead of sqrt(4*9) = 6; x = 26 (18+8) instead of 12. | `altitude_variation_check`, `right_altitude_transfer_check` | confirmed (2026-08-26) |

### Right Triangle Trigonometry with SOHCAHTOA

_Skill: Geometry and Trigonometry – right triangle trigonometry · spec: `right-triangle-trigonometry-sohcahtoa.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Hypotenuse by looks** | test | Identifies the hypotenuse from the drawing's orientation — the side under the marked angle or the shortest-looking side — instead of the side opposite the right angle. | Calls the side directly below the marked angle, or the side opposite theta, the hypotenuse. | `hypotenuse_observation_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Opposite and adjacent swapped** | test | Labels the side touching the chosen angle as opposite (or the far side as adjacent), so the wrong trig function gets picked. | sin(35) = 12/x or cos(35) = x/12 when the correct setup is tan(35) = x/12. | `relative_side_check`, `point_label_translation_check`, `ratio_selection_check`, `tangent_setup_check`, `sine_setup_check` | confirmed (2026-08-26) |
| **Solved to the wrong side** | test | When the unknown sits in the denominator (or numerator), multiplies where they should divide, flipping the final expression. | 9*sin(28) instead of 9/sin(28); 12/tan(35) instead of 12*tan(35). | `tangent_result_check`, `sine_result_check`, `cosine_result_check` | confirmed (2026-08-26) |
| **Radians mode, degree angle** | method | Types a degree angle into Desmos while it is still in its default radians mode. | tan(35) evaluated as 35 radians — a meaningless decimal. | `angle_mode_check`, `mode_interpretation_check` | confirmed (2026-08-26) |
| **Scaled the trig value too** | test | Multiplies sine or tangent by the scale factor when triangles are similar, instead of recognizing the ratio is unchanged. | Tangent doubles when every side is doubled. | `similar_trig_value_check`, `similar_length_contrast_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Scale factor upside down**<br>_family: Ratio built upside down_ | test | Builds the scale factor small-over-large when moving to the larger triangle. | (10*tan(38))*(10/25), which shrinks EF instead of enlarging it. | `combined_setup_check` | confirmed (2026-08-26) |

### Special Right Triangles: Recognize, Scale, Solve

_Skill: Geometry and Trigonometry – special right triangles · spec: `special-right-triangles-45-45-90-and-30-60-90.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Multiplied by sqrt(2) again** | test | Given the hypotenuse of a 45-45-90, multiplies by sqrt(2) instead of dividing to recover the leg. | Leg = 14*sqrt(2) (or 20 from hypotenuse 10*sqrt(2)) when the leg is 7*sqrt(2) or 10. | `forty_five_from_hypotenuse_check`, `forty_five_variable_hypotenuse_check`, `isosceles_right_keyword_check` | confirmed (2026-08-26) |
| **Halved it like 30-60-90** | test | Applies the hypotenuse-equals-2k rule to a 45-45-90, halving the hypotenuse (or doubling a leg) where sqrt(2) belongs. | Legs of 7 from hypotenuse 14; chord of 22 from two radii of 11. | `forty_five_from_hypotenuse_check`, `forty_five_variable_hypotenuse_check`, `isosceles_right_keyword_check`, `perpendicular_radii_check`, `independent_square_transfer` | confirmed (2026-08-26) |
| **Short and long legs swapped** | test | Attaches sqrt(3) to the wrong leg or reverses the short/long roles when reading off a 30-60-90. | Short leg 9*sqrt(3) and long leg 9, instead of 9 and 9*sqrt(3). | `thirty_sixty_from_hypotenuse_check`, `thirty_sixty_long_numeric_check`, `unsorted_ratio_recognition_check`, `hidden_angle_recognition_check` | confirmed (2026-08-26) |
| **Radical never cancelled for k** | test | Given a side like 15*sqrt(3), fails to match it to the k*sqrt(3) slot — divides by 3 or drags sqrt(3) into every other side. | Short leg 5*sqrt(3) and hypotenuse 10*sqrt(3) from long leg 15*sqrt(3); hypotenuse 2q*sqrt(3) from long leg q*sqrt(3). | `thirty_sixty_long_numeric_check`, `thirty_sixty_variable_long_check` | confirmed (2026-08-26) |
| **No printed angle, no conclusion** | test | Refuses to classify the triangle from its side ratio or a keyword, waiting for acute angles to be printed. | "Its type cannot be determined without an angle measure." | `forty_five_ratio_check`, `thirty_sixty_ratio_check`, `hidden_angle_recognition_check` | confirmed (2026-08-26) |
| **Wrong family for the setup** | test | Maps a classic setup — square diagonal, perpendicular radii, equilateral altitude — onto the wrong special-triangle family. | Chord of 11*sqrt(3) from perpendicular radii (used 30-60-90 on a 45-45-90 setup). | `square_exploration_check`, `equilateral_exploration_check`, `perpendicular_radii_check`, `scenario_mapping_check` | confirmed (2026-08-26) |
| **Stopped at k**<br>_family: Answered the wrong quantity_ | test | Solves for k or an intermediate side and reports it instead of the measurement the question asked for. | Answers 7 (short leg) or 14 (side) when the altitude 7*sqrt(3) was requested; 3x for a perimeter that is 6x. | `square_area_transfer_check`, `equilateral_perimeter_check`, `independent_equilateral_variable_transfer` | confirmed (2026-08-26) |

### Use Scale Factors with Similar Shapes

_Skill: Geometry and Trigonometry – similar figures: area and volume scaling · spec: `scale-factor-and-similar-shapes.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Linear factor on an area** | test | Multiplies an area or volume by the linear scale factor s instead of s^2 or s^3. | Larger area 70 = 28*(5/2) instead of 175 = 28*(25/4); volume 40 = 16*(5/2) instead of 250. | `area_observation_check`, `forward_area_check`, `surface_area_check`, `forward_volume_check`, `practice_linear_to_area`, `practice_linear_to_volume`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Squared when it needed cubing** | test | Picks the wrong power for the dimension — s^2 for a volume, s^3 for a surface area. | Larger volume 100 = 16*(5/2)^2 instead of 250; surface area 960 = 15*4^3 instead of 240. | `measurement_classification_check`, `proportion_setup_check`, `surface_area_check`, `forward_volume_check` | confirmed (2026-08-26) |
| **Same ratio, every measurement** | test | Carries the given ratio unchanged across dimensions, as if similarity preserves every ratio identically. | Volume ratio 4:49 copied straight from the surface-area ratio (should be 8:343). | `reverse_area_check`, `reverse_volume_check`, `area_to_volume_check`, `volume_to_area_check`, `practice_volume_to_area`, `practice_area_to_volume` | confirmed (2026-08-26) |
| **Skipped the linear bridge** | test | Powers the area or volume ratio directly instead of rooting back to the linear ratio first. | 16:2401 = (4:49)^2 for a volume ratio that is actually 8:343; 625:1296 instead of 25:36. | `area_to_volume_check`, `volume_to_area_check`, `practice_volume_to_area`, `practice_area_to_volume` | confirmed (2026-08-26) |
| **Wrong root, or half a root** | test | Takes a square root where a cube root belongs, or roots only one term of the ratio. | sqrt(27):8 from volume ratio 27:64; sqrt(121):64 offered as a linear ratio. | `reverse_volume_check`, `practice_surface_to_linear` | confirmed (2026-08-26) |
| **Ratio direction flipped**<br>_family: Ratio built upside down_ | test | Divides original by new (or second by first) so the scale factor points the wrong way. | Scale factor 6/15 = 2/5 instead of 15/6 = 5/2; linear ratio 5:6 when A-to-B is 6:5. | `ratio_direction_check`, `proportion_setup_check`, `practice_volume_to_linear` | confirmed (2026-08-26) |
| **Added dimensions instead of multiplying** | test | Doubles or triples the linear factor (s+s or s+s+s) instead of squaring or cubing it. | Area times 6 from linear factor 3; volume times 6 when each edge doubles (should be 8). | `area_observation_check`, `area_meaning_check`, `volume_observation_check` | confirmed (2026-08-26) |

## Information and Ideas

### CLEAR the Claim: Command of Evidence

_Skill: Information and Ideas – Command of Evidence · spec: `command-of-evidence-clear-the-claim.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **True but off target** | test | Accepts evidence that measures a different outcome from the one the claim names. | 'The trained group completed the task faster' offered for a claim about identification accuracy. | `opening_check`, `weaken_direction_check`, `true_but_irrelevant_check`, `capture_task_check` | confirmed (2026-08-26) |
| **Unmatched comparison** | test | Compares across times or conditions instead of the matched pair the claim requires. | 'Shaded surfaces were cooler in the morning than at midday' instead of shaded versus unshaded at the same time. | `opening_check`, `graph_prediction_check`, `graph_claim_check`, `gap_pattern_check` | confirmed (2026-08-26) |
| **Covers only part of claim** | test | Supports one condition or one half of a two-part claim and stops, though the claim's scope demands all of it. | 'The supplement group averaged 18 cm under high light' for an every-light-level claim, or a quote showing resistance but never acceptance. | `literature_check`, `graph_claim_check`, `graph_prediction_check`, `gap_pattern_check` | confirmed (2026-08-26) |
| **Graph says more than shown** | test | Reads sample sizes, durations, individual pairings, or misremembered values out of bars and aggregated counts. | 'Twelve seedlings received the standard solution' from a 12 cm bar, or a species-by-species comparison from unlinked category counts. | `specific_bar_check`, `provably_wrong_check`, `aggregation_check` | confirmed (2026-08-26) |
| **Certainty from suggestive data**<br>_family: Upgrades the claim_ | test | Drops the conditional and converts a single suggestive indicator into definitely or must. | 'Investment definitely caused all expansion in both periods.' | `hard_bridge_check` | confirmed (2026-08-26) |

### Good Cop / Bad Cop: Prove Every Reading Answer

_Skill: Information and Ideas – Reading Comprehension (answer verification) · spec: `good-cop-bad-cop-reading-answers.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Right fact, wrong job** | test | Keeps a choice because it is true in the passage even though it does not perform the question's task. | A restated detail on a main-purpose or function question. | `right_fact_wrong_job_check`, `function_question_check` | confirmed (2026-08-26) |
| **Some becomes every**<br>_family: Upgrades the claim_ | test | Silently upgrades a group or partial result into a claim about every, all, or any member. | 'The coating lowered indoor temperature in every tested building' when the indoor results varied. | `opening_question_check`, `island_lizards_wrong_choice_check`, `roof_coating_runner_up_check`, `bee_navigation_check`, `final_question_check` | confirmed (2026-08-26) |
| **Proved cause from pattern**<br>_family: Association becomes cause_ | test | Converts two observed differences or a timing coincidence into a proven or only cause. | 'Noise was the only cause of the decline in dolphin visits.' | `island_lizards_check`, `island_lizards_wrong_choice_check`, `final_question_check`, `final_wrong_choice_check`, `opening_question_check` | confirmed (2026-08-26) |
| **Invented motive or emotion** | test | Assigns a purpose or feeling the text never shows, turning silence or omission into intent. | 'Cartographers wanted to hide all commercial activity' or 'Devon is angry at the editors.' | `city_maps_check`, `devon_poem_check`, `devon_poem_wrong_choice_check`, `opening_question_check` | confirmed (2026-08-26) |
| **Good start, rotten ending** | test | Keeps a choice because its opening clause is supported and never tests the ending, where the overreach hides. | A supported roof result followed by 'so the coating lowered indoor temperature in every building,' or measured travel time 'proving' energy use. | `roof_coating_check`, `roof_coating_runner_up_check`, `bee_navigation_check`, `bee_navigation_wrong_choice_check` | confirmed (2026-08-26) |
| **Strong words banned on sight** | test | Crosses out a supported all or every answer by reflex while letting a hedged probably excuse a genuinely universal overreach. | 'Sealing probably prevents moisture loss in every container under all possible conditions' kept over the supported 'all 30 sealed containers.' | `strong_words_check` | confirmed (2026-08-26) |
| **Flipped who did what** | test | Reverses which item changed, which side won, or what the author's example was doing. | 'The distant reef became louder and received fewer dolphin visits' or 'the example rejects Sen's argument.' | `final_question_check`, `transportation_check` | confirmed (2026-08-26) |

### Inference Questions: Make the Smallest Supported Leap

_Skill: Information and Ideas – Inferences · spec: `inference-minimum-supported-conclusion.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Small result, giant claim**<br>_family: Upgrades the claim_ | test | Universalizes a limited finding with always, every, only, cannot, or must. | 'Mulch always prevents every tree from losing water' from a twelve-tree study. | `opening_exploration_check`, `strength_check`, `worked_example_check`, `association_check`, `data_variation_check`, `one_sentence_trap_check`, `independent_transfer_check` | confirmed (2026-08-26) |
| **Association becomes cause**<br>_family: Association becomes cause_ | test | Converts an observed relationship into a causal claim, sometimes with the causation running backward. | 'Lower temperatures caused builders to cut slits' or 'satellite measurements caused the marsh to stop shrinking.' | `soundbite_check`, `association_check`, `one_sentence_trap_check`, `worked_example_check`, `opening_exploration_check` | confirmed (2026-08-26) |
| **Invented backstory** | test | Adds motives, events, or conditions the passage never states to make the story feel complete. | 'Species B stopped laying eggs before the drought began' or 'slits were used only in the hottest regions.' | `combine_facts_check`, `soundbite_check`, `one_sentence_trap_check`, `independent_transfer_check` | confirmed (2026-08-26) |
| **Predicting past the passage** | test | Treats a plausible aftermath or outside-knowledge extension as if the text supported it. | 'The unmulched trees must have died soon after the study.' | `definition_check`, `strength_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **One-sentence conclusion** | test | Builds the conclusion from a single sentence's topic instead of combining every relevant fact. | A choice echoing one sentence while ignoring the comparison the other facts establish. | `definition_check`, `one_sentence_trap_check`, `final_retrieval_check` | confirmed (2026-08-26) |

### Process and Pre-Answer Reading Comprehension Questions

_Skill: Information and Ideas – Central Ideas and Details · spec: `reading-comprehension-process-and-pre-answer.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Choices read first**<br>_family: Choices steer the reading_ | test | Opens the answer choices before building meaning, letting their wording interpret the passage instead of the reverse. | A choice that supplies the meaning of a sentence the student never actually understood. | `process_order_check`, `introduction_check`, `repair_strategy_check`, `final_retrieval` | confirmed (2026-08-26) |
| **Keyword match, flipped meaning** | test | Keeps a choice because it repeats passage words even though it reverses the direction of the comparison. | 'The heat wave caused shaded ponds to lose more water than unshaded ponds.' | `keyword_trap_check`, `repair_strategy_check`, `final_retrieval` | confirmed (2026-08-26) |
| **Every and always upgrades**<br>_family: Upgrades the claim_ | test | Promotes a limited or qualified comparison into a universal or permanent rule. | 'Pale coatings will permanently lower the air temperature of every city.' | `opening_observation_check`, `inference_check`, `detail_variation_check`, `preanswer_quality_check`, `independent_transfer_one_check` | confirmed (2026-08-26) |
| **Cause the passage never named**<br>_family: Association becomes cause_ | test | Supplies a mechanism or cause, like noise or tracking, that the text never states. | 'City lights cause migrating birds to reach resting places sooner' or 'tracking foxes caused the population to become stable.' | `opening_observation_check`, `dense_sentence_check`, `preanswer_quality_check`, `inference_check` | confirmed (2026-08-26) |
| **Generally true, textually unproven** | test | Accepts a choice because it matches real-world plausibility or background knowledge rather than the passage. | 'Original artifacts are always more valuable to visitors than replicas are.' | `background_knowledge_check`, `preanswer_quality_check`, `choices_matching_check` | confirmed (2026-08-26) |

## Craft and Structure

### Solve Words in Context with Read, Predict, Match

_Skill: Craft and Structure – Words in Context · spec: `words-in-context-read-predict-match.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Choices before the text**<br>_family: Choices steer the reading_ | test | Studies the answer choices first and lets an attractive word steer the interpretation of the passage. | Whichever familiar choice seems possible once a reason is invented for it. | `process_order_check`, `final_retrieval` | confirmed (2026-08-26) |
| **Blank-sentence tunnel vision** | test | Reads only the sentence containing the blank and misses the deciding clue in a neighboring sentence. | A word like 'celebrated' that fits the lone sentence but ignores the passage's evidence. | `opening_observation_check`, `process_order_check`, `final_retrieval` | confirmed (2026-08-26) |
| **Vibes over evidence** | test | Picks by positive tone, sophistication, or how an unfamiliar word feels instead of by a context clue. | The most impressive- or pleasant-sounding choice regardless of the clues. | `process_order_check`, `feeling_check`, `unfamiliar_choice_check`, `final_retrieval` | confirmed (2026-08-26) |
| **Unknown word auto-eliminated** | test | Crosses out a choice purely because its meaning is unfamiliar, keeping a known word that conflicts with the clues. | 'Conclusive' kept as the safe familiar word over the correct 'provisional.' | `unfamiliar_choice_check`, `final_retrieval` | confirmed (2026-08-26) |
| **Weak prediction, wrong clue** | test | Predicts from the shallowest clue and forces a match, missing the stronger result clue the sentence actually rewards. | A choice matching 'made research cheaper' when the passage's point is expanded access, 'democratized.' | `no_match_check`, `prediction_quality_check` | confirmed (2026-08-26) |
| **Missed the reversal** | test | Ignores however, despite, or rather than and picks the word that fits the un-flipped meaning. | 'Enthusiasm' where Despite demands 'skepticism,' or 'appropriate' where the evidence contradicts the description. | `logic_direction_check`, `whole_text_check`, `transfer_one_check`, `transfer_two_check` | confirmed (2026-08-26) |

## Expression of Ideas

### Bracket the Pivot: Choose Precise SAT Transitions

_Skill: Expression of Ideas – Transitions · spec: `transitions-bracket-the-pivot.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Contrast reflex** | test | Grabs nevertheless or however whenever the second sentence differs at all, without checking for a defeated expectation. | 'Nevertheless,' where the second idea is actually an example or the usual alternative. | `opening_check`, `same_direction_check`, `local_signal_check`, `independent_transfer_local_scale` | confirmed (2026-08-26) |
| **Therefore without a cause** | test | Labels whatever comes next a result even when the first idea does not cause or justify it. | 'Therefore,' or 'Consequently,' where the second sentence merely continues, illustrates, or compares. | `opening_check`, `same_direction_check`, `local_signal_check`, `independent_transfer_local_scale`, `bracket_exact_ideas_check` | confirmed (2026-08-26) |
| **For example without an example** | test | Picks the example transition when the second sentence is a conclusion or alternative, not a specific case of the first. | 'For example,' before a sentence that gives no specific instance. | `opening_check`, `result_and_purpose_check`, `guided_transfer_result`, `local_signal_check` | confirmed (2026-08-26) |
| **Addition for any agreement** | test | Sees the same topic pointing the same direction and settles for moreover or additionally when the real link is example, result, or supported conclusion. | 'Additionally,' where the sentence is actually a conclusion drawn from the previous evidence. | `same_direction_check`, `guided_transfer_result`, `final_retrieval` | confirmed (2026-08-26) |
| **Missing the local signal** | test | Overlooks an in-sentence scale word like rarely, so the frequency-comparison phrase never enters consideration. | A standard global transition instead of 'More often,' completing the rarely-X, more-often-Y scale. | `opening_check`, `local_signal_check`, `independent_transfer_local_scale` | confirmed (2026-08-26) |
| **Bracketing the wrong ideas** | test | Connects the transition to background detail or distant ideas instead of the two ideas immediately around the blank. | A transition justified by a pair like 'the coating was expensive, so saltwater damages ships.' | `bracket_exact_ideas_check`, `shrink_the_ideas_check`, `predict_relationship_check` | confirmed (2026-08-26) |

### Rhetorical Synthesis: Let the Goal Lead

_Skill: Expression of Ideas – Rhetorical Synthesis · spec: `rhetorical-synthesis-goal-first.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **True fact, wrong goal** | test | Keeps an accurate detail from the notes that does not perform the job named after 'wants to.' | 'The archive's first neighborhood branch opened in 1998' for an introduce-and-emphasize-leadership goal. | `first_exploration_check`, `action_word_check`, `comparison_check`, `and_rule_check` | confirmed (2026-08-26) |
| **Half the goal done** | test | Satisfies one of two requirements joined by and, or covers one side or the wrong attribute of a comparison. | 'Visitors can turn a wheel to change the colors' — interaction explained, exhibit never introduced. | `and_rule_check`, `comparison_check`, `independent_transfer_check` | confirmed (2026-08-26) |
| **Longest answer wins** | test | Judges choices by length or detail count instead of goal fit. | The most detailed, most-facts choice regardless of the stated purpose. | `worked_example_check`, `final_retrieval_check` | confirmed (2026-08-26) |
| **Notes upgraded to proof**<br>_family: Association becomes cause_ | test | Restates observational notes as a causal experiment, a proof, or a reversed winner. | 'Adding flowering species caused visits to rise' or 'the ground method was more accurate' when the drone was closer. | `fact_check_example_check`, `independent_transfer_check` | confirmed (2026-08-26) |
| **Goal skipped, keywords scanned** | test | Ignores the student's stated goal and matches choices to repeated words from the notes. | Any note-echoing choice, whatever its rhetorical purpose. | `stem_anatomy_check`, `final_retrieval_check` | confirmed (2026-08-26) |

## Standard English Conventions

### Place Transition Words by Logic

_Skill: Standard English Conventions – Boundaries · spec: `boundaries-transition-word-placement-and-logic.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Transitions only point forward** | test | Assumes a transition must begin its clause and connect to the next sentence, so clause-final transitions get misread or auto-eliminated. | Eliminating any choice with a sentence-final however, or testing the following clause's logic instead of the previous one's. | `placement_check`, `backward_check`, `final_retrieval` | confirmed (2026-08-26) |
| **Glued to the wrong clause** | test | Attaches the transition to the clause on the wrong side of the full stop, so the wrong pair of ideas gets tested for cause or contrast. | '; consequently,' when the result relationship is A to B, or ', consequently;' when it is B to C. | `attachment_check`, `model_logic_check`, `guided_before_check`, `guided_after_check`, `period_placement_check`, `transfer_before_full_stop`, `transfer_after_full_stop`, `movement_check` | confirmed (2026-08-26) |
| **Comma-only however** | test | Offsets the transition with commas on both sides where a full stop is required, splicing two complete sentences. | ', however,' or ', consequently,' between two independent clauses. | `guided_before_check`, `guided_after_check`, `period_placement_check`, `transfer_before_full_stop`, `transfer_after_full_stop` | confirmed (2026-08-26) |
| **Though leads like However** | test | Puts though first in its clause as if it were However, or leaves a though-clause standing after a semicolon or period, creating a dependent clause where an independent one is required. | 'Though, the crews kept working.' or 'the venue stayed open; though the field remained wet.' | `though_initial_check`, `though_elimination_check`, `though_job_check` | confirmed (2026-08-26) |
| **Contrasting words, not ideas** | test | Reads the transition as linking two nearby nouns instead of two complete ideas. | 'However contrasts pollen and soil' rather than the two full clauses. | `exploration_check`, `backward_check` | confirmed (2026-08-26) |

### Solve SAT Boundaries Questions in the Fastest Order

_Skill: Standard English Conventions – Boundaries · spec: `boundaries-punctuation-order.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Pick by pause** | test | Chooses punctuation by reading aloud and judging which pause sounds smoothest or looks strongest instead of testing each mark's grammatical job. | A dash or comma that feels natural to the ear but fails the complete-sentence test. | `exploration_check`, `duplicate_choice_check`, `final_retrieval` | confirmed (2026-08-26) |
| **Comma splice sounds fine** | test | Joins two complete sentences with a bare comma because the pause feels right. | A lone comma between two independent clauses, as in 'The volunteers reopened the trail, the hikers returned.' | `comma_splice_check`, `comma_jobs_check`, `practice_full_stop` | confirmed (2026-08-26) |
| **However is not FANBOYS** | test | Treats ', however,' or ', because' as if it were comma plus FANBOYS and lets it join two complete sentences. | ', however,' gluing two independent clauses together. | `fanboys_check`, `comma_splice_check` | confirmed (2026-08-26) |
| **Colon grabbed for any list** | test | Places a colon because a noun or list follows the blank without checking that the words before it form a complete sentence. | A colon after a fragment or dependent clause, as in 'Because the garden needed one improvement: more shade.' | `exploration_check`, `colon_gate_check`, `colon_check` | confirmed (2026-08-26) |
| **Comma cuts subject from verb** | test | Inserts punctuation between a long subject and its verb, or between a label and the name that identifies it. | 'The collection of masks, attracts visitors' or 'Author, Toni Morrison won the Nobel Prize.' | `subject_verb_check`, `essential_name_check`, `comma_jobs_check` | confirmed (2026-08-26) |
| **Dash pair left unclosed** | test | Opens an interruption with a dash but closes it with a comma, colon, or nothing, instead of a matching dash. | A mismatched pair like 'The comet, first seen in May—returned in August.' | `paired_dash_check`, `practice_dash` | confirmed (2026-08-26) |
| **Semicolon myths** | test | Believes a semicolon is only for lists, is stronger than a period, or must appear before and, instead of treating it as interchangeable with a period between sentences. | Keeping a semicolon over an otherwise-identical period choice when both should be eliminated together. | `duplicate_choice_check`, `serial_semicolon_check`, `final_retrieval` | confirmed (2026-08-26) |
| **Fragment passes as sentence** | test | Counts a because-clause or -ing phrase as a complete sentence, so full-stop and colon tests get applied to words that cannot stand alone. | Full-stop punctuation next to a fragment like 'Because the instruments recorded the tremor.' | `complete_sentence_check`, `colon_gate_check`, `colon_check` | confirmed (2026-08-26) |

### Solve Subject–Verb Agreement with the Odd-One-Out Trick

_Skill: Standard English Conventions – Form, Structure, and Sense (Subject–Verb Agreement) · spec: `subject-verb-agreement-odd-one-out.json`_

| Trap (proposed name) | Scope | The error | Shows up as | Seen in | Status |
|---|---|---|---|---|---|
| **Match the nearest noun** | test | Agrees the verb with the closest noun, usually a plural inside a prepositional phrase, instead of the true subject or the choice set. | A plural verb pulled in by nearby nouns like 'the coastal villages.' | `tense_trap_check`, `sat_example_one_check`, `retrieval_check` | confirmed (2026-08-26) |
| **The -s ending reflex** | test | Picks the verb ending in -s whenever anything singular appears in the sentence, without testing the choices. | The lone -s verb chosen on sight, like 'analyzes.' | `tense_trap_check`, `retrieval_check` | confirmed (2026-08-26) |
| **Tense mistaken for number** | test | Treats past or future forms as singular or plural and runs the shortcut on sets where a choice fits both he and they. | 'Analyzed' defended as singular, or the odd-one-out trick forced onto an ineligible set containing 'predicted.' | `tense_trap_check`, `both_check`, `final_eligibility_check`, `eligible_set_check` | confirmed (2026-08-26) |
| **Bare -ing counted as verb** | test | Classifies a standalone -ing form as a usable singular or plural verb even though it completes neither he nor they. | 'Documenting' or 'developing' kept in play as a real verb choice. | `neither_check`, `form_trap_check`, `eligible_set_check` | confirmed (2026-08-26) |
