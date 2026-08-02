# Memory

## Project Overview

See @README.md for project overview and @package.json for available npm/pnpm commands for this project.

## Commands

- `pnpm dev` — dev server only; the Hono API Worker does NOT run under dev
- `pnpm build` — production build to `build/client`; also copies `__spa-fallback.html` → `404.html` (SPA fallback)
- `npx wrangler dev` — full local stack (Worker + Durable Object); run `pnpm build` first, then test sync at http://localhost:8787 in two tabs
- `pnpm typecheck` — runs `react-router typegen && tsc`; typegen writes `.react-router/types` (generated, don't edit)
- `npx wrangler deploy` — deploy Worker + static assets
- `pnpm format` — runs `prettier --write .`
- No lint or test scripts exist

## Architecture Notes

- React Router v8 SPA (`ssr: false`), prerendered routes `['/', '/play']` (react-router.config.ts)
- Flat routes via `@react-router/fs-routes`: `app/routes/` → `_index.tsx`, `about.tsx`, `play.tsx`, `sync.tsx`; path alias `~/*` → `./app/*`
- `app/shared/*` exports and React are auto-imported by unplugin-auto-import (see `auto-imports.d.ts`, regenerated on dev/build); existing code still imports explicitly — follow that explicit style
- `app/shared/sync.ts` is the device-sync core: MobX store + WebRTC mesh (largest file, ~1170 lines)
- `worker/index.ts` — Hono app; the only API endpoint is `GET /api/sync/room` (WebSocket signaling, rate-limited via `SYNC_RATE_LIMITER`); all other paths serve static assets from `build/client`
- `worker/room-coordinator.ts` — hibernatable Durable Object (`ROOMS` binding, sqlite migration v1), max 5 connections, strict message validation
- Privacy invariant: subtitle content and playback data only travel over direct WebRTC data channels; the server relays only bounded SDP/ICE signaling — do not break this
- `wrangler.json` serves assets from `./build/client` — build before `wrangler dev`/`deploy` or you serve stale/absent assets

## Code Style Guidelines

- Use descriptive variable names
- Follow existing patterns in the codebase
- Extract complex conditions into meaningful boolean variables
- Prettier: `singleQuote`, no `semi` (`.prettierrc`); tabs for indentation (`.editorconfig`)

## Common Workflows

- Quick UI iteration (no sync): `pnpm dev`
- Test device sync locally: `pnpm build && npx wrangler dev`, open http://localhost:8787 in two tabs (use `localhost` and `127.0.0.1` for separate IndexedDB)
- Verify changes: `pnpm typecheck` (includes route typegen — run it after adding/renaming routes)
- Node 24 (`.node-version`), pnpm 11 (`packageManager`); `pnpm-workspace.yaml` sets `savePrefix: ""` (exact versions, no `^`)
