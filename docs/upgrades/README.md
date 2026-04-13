# Upgrade documentation

Verbatim copies of the upstream upgrade guides for the major dependencies we
plan to move to as part of the Phase 1 → Phase 2 rebuild. Everything in this
directory is a captured snapshot of third-party documentation — do not edit the
body of these files.

See `docs/architecture-plan.md` §3.6 and the "Phase 1.5: Dependency upgrade
plan" section (to be added after these docs are reviewed) for how they fit
into the rebuild timeline.

## Files

| File | Scope | Source |
|---|---|---|
| `nextjs-16-upgrade-guide.md` | Upgrading a Next.js app from 15 to 16 | [vercel/next.js docs](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/02-guides/upgrading/version-16.mdx) |
| `nextjs-15-upgrade-guide.md` | Upgrading from 14 to 15 (we're on 14.2.5, so this is the first half of our jump) | [vercel/next.js docs](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/02-guides/upgrading/version-15.mdx) |
| `react-19-upgrade-guide.md` | Upgrading a React 18 app to React 19 (breaking changes, codemods, TypeScript notes) | [reactjs/react.dev blog](https://raw.githubusercontent.com/reactjs/react.dev/main/src/content/blog/2024/04/25/react-19-upgrade-guide.md) |
| `react-19-release-notes.md` | React 19 release announcement — the "why" and new features | [reactjs/react.dev blog](https://raw.githubusercontent.com/reactjs/react.dev/main/src/content/blog/2024/12/05/react-19.md) |
| `react-19-2-release-notes.md` | React 19.2 release notes — View Transitions, `useEffectEvent`, Activity | [reactjs/react.dev blog](https://raw.githubusercontent.com/reactjs/react.dev/main/src/content/blog/2025/10/01/react-19-2.md) |

## Refreshing a file

All five files were captured with `curl` from the canonical canary/main branch
of their respective vendor repos. To refresh any one:

```bash
curl -sL <source-url> -o docs/upgrades/<filename>.raw
# then re-add the header comment block and replace the old file
```

(Or just re-run the fetch block in the commit that introduced this directory;
it downloads all five in parallel via `xargs -P5`.)

## What to read first

If you have limited time, the priority order is:

1. **`nextjs-16-upgrade-guide.md`** — the destination. Includes the
   `middleware` → `proxy` rename, Turbopack-by-default, and the removal of the
   synchronous fallback for Async Request APIs. Critical for our middleware
   work from Phase 1.
2. **`nextjs-15-upgrade-guide.md`** — the intermediate step. The Async Request
   APIs change originates here; all the codemods we need come from the 15
   guide.
3. **`react-19-upgrade-guide.md`** — the React-side breaking changes:
   removed `propTypes`, removed `ReactDOM.render`, `useRef` requires an
   argument, the JSX namespace changes, the `ref` cleanup change. Plus the
   codemod commands.
4. **`react-19-release-notes.md`** — the new features (Actions, `use()`,
   `useActionState`, `useOptimistic`, Server Components improvements, ref as
   a prop). Read this to decide what Phase 2 code should actually adopt.
5. **`react-19-2-release-notes.md`** — incremental additions over 19.0:
   View Transitions, `useEffectEvent`, Activity. Lower priority; read when
   considering animation/performance features.
