@AGENTS.md

## Full send

Full send runs are allowed to merge their own PRs. Mooshay105 accepted that merging to `main` deploys to production and runs the production sync (see "What merging triggers").

### Commands

Run from the repo root. Use bun, never npm.

| Step | Command |
|---|---|
| Install | `bun install --frozen-lockfile` |
| Typecheck | `bun run typecheck` (runs `next typegen`, then `tsc --noEmit`) |
| Lint | `bun run lint` |
| Test | `bun run test` (`bun test`, tests live in `tests/`) |
| Build | `bun run build` |
| Dev server | `TURSO_DATABASE_URL=file:local.db bun run dev` |

CI (`.github/workflows/ci.yml`, job `ci`) runs install, typecheck, lint, test and build on every PR and on pushes to `main`. All of them work with no env vars set.

### Viewing the app

- `.env.local` points at the **production** Turso database. Bun and Next both load it, so always set `TURSO_DATABASE_URL=file:local.db` on the command line for local runs. A shell variable overrides `.env.local`.
- Create the local database once with `TURSO_DATABASE_URL=file:local.db bun run db:migrate`. It starts empty. To fill it from the live feeds, run `TURSO_DATABASE_URL=file:local.db bun run sync <feed id> --apply` (needs the feed's API key; `se-ul` and the other Swedish feeds use `TRAFIKLAB_KEY`).
- Open http://localhost:3000. `/` redirects to `/en` or `/sv`. Use `PORT=<n>` for another port.
- Sign-in uses Clerk and only runs when both Clerk keys are set. There is no seed user. Admin pages need a Clerk user id listed in `ADMIN_USER_IDS`.

### What merging triggers

- Merging to `main` triggers a Vercel **production** deploy. Vercel runs `vercel-build`, which runs `bun scripts/sync.ts --apply --deploy` against the production database before `next build`. Preview deploys skip the sync.
- `.github/workflows/sync.yml` also writes to the production database on a schedule. It runs from `main`, so changes to `scripts/sync.ts`, `lib/feeds/`, `db/` or `data/changes.csv` reach production data on the next run.

### Never touch

- Secrets and env files: `.env.local`, any `.env*` except `.env.example`, GitHub secrets, the `Pull Buses Job` environment, Vercel project settings.
- Production data: never run `bun run sync --apply`, `bun run import:feed`, `bun run db:migrate` or `bun run db:studio` without `TURSO_DATABASE_URL=file:local.db`.
- Schema changes: `db/schema.ts`'s `SCHEMA` is applied by `db:migrate` and is the migration. Do not change it, and never run `drizzle-kit push`.
- `vercel-build` and `.github/workflows/sync.yml`: they control production writes.
- `data/changes.csv` rows: they are contributor-reviewed bus data. Only change them when the task is about that data.
