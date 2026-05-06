# AGENTS.md

## Cursor Cloud specific instructions

This is a **TypeScript library** (not a runnable application/service). There are no servers, databases, or external services.

### Runtime requirements

- **Node.js 22** (matches CI)
- **pnpm 10.33.1** (pinned in `package.json` `"packageManager"` field; activated via `corepack`)

### Key commands

All scripts are defined in `package.json`:

| Task | Command |
|---|---|
| Install deps | `pnpm install --frozen-lockfile` |
| Typecheck | `pnpm run typecheck` |
| Test | `pnpm test` |
| Test (watch) | `pnpm run test:watch` |
| Coverage | `pnpm run coverage` |
| Build | `pnpm run build` |

### Running examples

Examples in `examples/` import from `../src/index.js` (source, not `dist`). Run them with `npx tsx examples/<file>.ts` — no build step required.

### Notes

- ESM-only package (`"type": "module"`). All imports must use `.js` extensions.
- The `dist/` directory is git-ignored; it is only produced by `pnpm run build` for publishing.
- CI runs typecheck, tests, and coverage in that order (see `.github/workflows/ci.yml`).
