# Documentation index

Every document declares its status in a banner under its title:

- **Living** — kept true against the code; carries a last-verified
  date. If you change behavior it describes, update it in the same PR.
- **Historical** — a record of a moment (a plan, an audit, a deploy);
  accurate for its date, not maintained. Never cite one for current
  behavior.
- **Generated** — produced by a script; never hand-edit.

`scripts/check-code-hygiene.mjs` (CI) rejects retired terminology
outside allowlisted historical docs, and CI regenerates the
authorization matrix to prove it's fresh.

## Living

| Document | What it is |
|---|---|
| `upgrade-plan-2026-07.md` | **The active roadmap** — verified against code + production |
| `runbook.md` | Operational runbook (incidents, deploys, hotfix migrations, e2e) |
| `database.md` | Schema operations + safe service-role usage |
| `lesson-json-authoring-guide.md` | Lesson JSON authoring format |
| `lesson-template-specs/` | Lesson template specifications |
| `../supabase/migrations/README.md` | Migration-directory state — **read before any `supabase db` command** |
| `../SUBSCRIPTION_PLAN.md` | Billing model as shipped |
| `../CLAUDE.md` | Operating state + rules for new work (agents load this) |
| `../README.md` | Repo orientation |

## Generated

| Document | Generator |
|---|---|
| `authorization-matrix.md` | `scripts/generate-auth-matrix.mjs` (CI-verified freshness) |

## Historical

| Document | Record of |
|---|---|
| `architecture-plan.md` | The v1→v2 rebuild design (shipped) |
| `decommission-plan.md` | Legacy-tree decommission tracker (complete) |
| `greenfield-build-plan.md` | Restart-from-scratch exploration; adopted ideas tracked in the upgrade plan |
| `lesson-builder-feature-audit-2026-04-25.md` | Lesson-builder audit — **contains a known error** (see banner) |
| `lesson-authoring-integration-contract-2026-04-25.md` | Lessonworks integration contract |
| `history/authorization-matrix-2026-05-04.md` | Hand-written auth matrix (superseded by the generated one) |
| `history/2026-05-phase2-step9-deploy.md` | Parallel-build-period deploy record |
| `../SCALING_ANALYSIS.md` | Point-in-time scaling analysis (annotated 2026-07-12) |
| `upgrades/` | Framework upgrade guides (Next 15/16, React 19) |
