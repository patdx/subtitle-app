# Memory

## Project Overview

See @README.md for project overview and @package.json for available npm/pnpm commands for this project.

## Commands

- `pnpm dev` — dev server only; the Hono API Worker does NOT run under dev
- `pnpm build` — production build to `build/client`; also copies `__spa-fallback.html` → `404.html` (SPA fallback)
- `npx wrangler dev` — full local stack (Worker + Durable Object); run `pnpm build` first, then test sync at http://localhost:8787 in two tabs
- `pnpm typecheck` — runs `react-router typegen && tsc`; typegen writes `.react-router/types` (generated, don't edit)
- `pnpm test` — Vitest unit tests (`vitest run`); sync claim/group-state logic lives in `app/shared/sync-group.ts`
- `npx wrangler deploy` — deploy Worker + static assets
- `pnpm format` — runs `prettier --write .`

## UI Components (shadcn + Base UI)

- This project uses **shadcn/ui with Base UI** (`style: base-nova` in `components.json`), aliases: `components` → `~/components`, `ui` → `~/components/ui`, `lib`/`hooks` → `~/shared`, `utils` → `~/shared/utils`
- **Always generate UI components with the shadcn CLI** — do not hand-write them. Run:
  ```sh
  pnpx shadcn@latest add <component>
  ```
  (Use `pnpx shadcn@latest ...` — the bare `shadcn` binary may fail permission checks.)
- The CLI writes to `app/components/ui/`, e.g. `app/components/ui/tooltip.tsx`. Components installed so far: `button`, `menu`, `tooltip`
- After adding a shadcn component via the CLI, run `pnpm build` to confirm the React Compiler (`babel-plugin-react-compiler`) has no issues with the generated code — `pnpm typecheck` alone is not sufficient
- Existing shadcn components should be composed together (e.g. `MenuTrigger` + `MenuContent`, `Tooltip` + `TooltipTrigger` + `TooltipContent`) rather than replaced with custom popovers

## Architecture Notes

- React Router v8 SPA (`ssr: false`), prerendered routes `['/', '/play']` (react-router.config.ts)
- Flat routes via `@react-router/fs-routes`: `app/routes/` → `_index.tsx`, `about.tsx`, `play.tsx`, `sync.tsx`; path alias `~/*` → `./app/*`
- `app/shared/*` exports and React are auto-imported by unplugin-auto-import (see `auto-imports.d.ts`, regenerated on dev/build); existing code still imports explicitly — follow that explicit style
- `app/shared/sync.ts` is the device-sync core: MobX store + WebRTC mesh (largest file, ~1170 lines)
- `worker/index.ts` — Hono app; the only API endpoint is `GET /api/sync/room` (WebSocket signaling, rate-limited via `SYNC_RATE_LIMITER`); all other paths serve static assets from `build/client`
- `worker/room-coordinator.ts` — hibernatable Durable Object (`ROOMS` binding, sqlite migration v1), max 5 connections, strict message validation
- Privacy invariant: subtitle content and playback data only travel over direct WebRTC data channels; the server relays only bounded SDP/ICE signaling — do not break this
- `wrangler.json` serves assets from `./build/client` — build before `wrangler dev`/`deploy` or you serve stale/absent assets
- **No backwards compat for local state:** prefer breaking cleanly and resetting over migrations, fallbacks, or shims for old IndexedDB records / data shapes (e.g. missing content hashes). Do not add `fileId` fallbacks when hash is the identity. Ship or use **Reset all local data** (About page) — or instruct a force-clear — instead of compatibility branches.

## Code Style Guidelines

- Use descriptive variable names
- Follow existing patterns in the codebase
- Extract complex conditions into meaningful boolean variables
- Prettier: `singleQuote`, no `semi` (`.prettierrc`); tabs for indentation (`.editorconfig`)

## Common Workflows

- Quick UI iteration (no sync): `pnpm dev`
- Test device sync locally: `pnpm build && npx wrangler dev`, open http://localhost:8787 in two tabs (use `localhost` and `127.0.0.1` for separate IndexedDB)
- Verify changes: `pnpm typecheck` (includes route typegen — run it after adding/renaming routes)
- **Formatting:** always run `prettier --write` (`npx prettier --write <files>`, or `pnpm format` for everything), never `prettier --check`. Checking first just adds an extra pass — if you'd reach for `--check`, `--write` is the efficient move.
- **Player UI testing:** append `?keep-ui-open=1` to the player URL (e.g. `http://localhost:5173/play?id=<id>&keep-ui-open=1`) to disable the 5s controls auto-fade while iterating on the layout
- **Sync debug hooks:** `app/shared/sync.ts` exposes `window.__syncState` (the live Valtio sync store), `window.__seek(ms)`, and `window.__togglePlayback()` for manual inspection from the browser console. Read a tab's role/claim/peers via `window.__syncState` when debugging the sync flows. These are intentional, kept in the codebase.
- Node 24 (`.node-version`), pnpm 11 (`packageManager`); `pnpm-workspace.yaml` sets `savePrefix: ""` (exact versions, no `^`)

### wrangler dev gotchas

- **Rebuild → restart:** `wrangler dev` serves `build/client` at startup; a `pnpm build` while it's running can leave it serving 404s for everything. After any `pnpm build`, kill wrangler and start it fresh.
- **Never kill by process name in the same command that launches it.** A command like `pkill -f "wrangler dev"; npx wrangler dev &` self-matches: the shell's own command line contains "wrangler dev", so `pkill -f`/`pgrep -f` kills the shell running the command, which hangs the tool until timeout. Kill by **port** instead:
  ```sh
  pid=$(ss -ltnp 2>/dev/null | grep ':8787' | grep -oP 'pid=\K[0-9]+' | head -1)
  [ -n "$pid" ] && kill -9 "$pid"
  ```
  Then launch with `setsid nohup npx wrangler dev > /tmp/opencode/wrangler-dev.log 2>&1 < /dev/null & disown` and poll `curl` until `200`.
- A stale `workerd` from a killed session can keep the port in a 404 state; check `ss -ltnp | grep 8787` and kill by that pid if needed.
