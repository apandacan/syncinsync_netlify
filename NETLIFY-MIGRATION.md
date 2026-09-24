# syncinsync_netlify

Implemented locally: Netlify static hosting and request functions, Supabase durable storage and instant WebSocket updates. Nothing has been deployed or connected to a hosted database. Account configuration and a hosted smoke test remain before release.

## Isolation

New project: `C:\Users\danee\Documents\Codex\2026-09-24\syncinsync-netlify\outputs\syncinsync_netlify`

Source, read only: `C:\Users\danee\OneDrive\Documents\GitHub\SyncInSync`

All 16 source files were copied and verified by SHA-256 before editing this project. Git history, backups, node_modules, and machine-local configuration were excluded. Dependencies were installed afresh into this copy. This is a copy of local files, not a representation of Render's deployed source or configuration.

`shared_state.json` is the private copied local snapshot. It remains outside `public`, is ignored by Git, and is never read by the Netlify function or browser build. It has not been imported into Supabase. The original project and its existing backup ZIP were not modified. No live Render requests, pushes, deployments, or hosted resource creation were performed.

## Selected architecture

The user selected a separate free-tier backend to preserve instant syncing. `netlify.toml` publishes `public` after `npm run build`, which bundles the pinned Supabase browser library. Netlify Functions handle `GET /state`, `POST /update`, and `GET /runtime-config`. Supabase Postgres persists the board; Supabase Realtime pushes committed updates to subscribed browsers. There is no periodic board polling.

The original persistent Node HTTP server is retained for local use through `npm start`, using local file storage and SSE. Board rules now live in `lib/board.cjs`, shared by both backends. Netlify does not try to run that persistent server. The old `/events` endpoint on Netlify returns a reload message for stale clients; current clients select the transport from `/runtime-config`.

Every cloud edit is derived from a database revision. A PostgreSQL transaction locks the board, checks the expected revision, saves the new state, and records the request ID atomically. Conflicting edits reload and retry against the latest state; repeated request IDs return their saved response without applying X twice. Receipts expire after one day on subsequent writes. Browser revision checks reject late snapshots/events so older responses cannot roll back newer state. Rejoining the live channel and returning to a visible/online page triggers a fresh snapshot for recovery.

The homepage's expected publish directory is `public`, but the reported Netlify site's actual settings were not inspected. Publishing only static files would still leave the board without a backend; this project needs its functions and Supabase configuration.

## Features preserved

- Shared student roster, assignments, balanced randomization, and draggable time dividers.
- Five shared non-interviewer role checks, derived strike-through, and reversible X complete-all/restore-previous-checks.
- Patient selection and HPI remain local to each browser.
- Four PDF guides and the existing guide interface.
- `dz1234` remains local roster-free admin mode, not secure authentication.

## Free-tier tradeoffs

Supabase adds an account and a service dependency. Published Free allowances include 500 MB database storage, 5 GB egress, 2 million Realtime messages, and 200 peak Realtime connections. Free projects may pause after one week of inactivity and do not include automatic backups. Network latency, reconnection, and service availability affect delivery; instant syncing means push delivery rather than waiting for a polling interval. No paid plan or add-on has been enabled. Netlify has its own plan limits.

This preserves the existing open shared-board access model. Anonymous clients may read the board, while database writes are only granted to the server RPC. The app's public update endpoint still allows board edits without a user login, as the original app did. Use only non-PHI content, as required by the original README. Keep this board in its own Supabase project; an extra board ID is not a privacy boundary because the read policy covers this table.

## Local validation

- Browser build passed; generated assets do not import the snapshot or environment secrets.
- `npm test`: 18 passed, including the 15 original server tests and new SQL concurrency, duplicate request, database permission, and HTTP validation checks.
- Both original Edge/Playwright browser suites passed against local SSE.
- Both original browser suites also passed against the cloud adapter with synthetic data, the actual Supabase SDK, local HTTP/WebSocket protocol fixtures, and the actual SQL executed in PGlite.
- The added cloud browser check passed push delivery, stale-event rejection, divider dragging, disconnect/rejoin recovery, absence of periodic `/state` requests, local HPI and selection, and all four PDF responses.

PGlite is a local PostgreSQL runtime. The protocol fixture simulates Supabase's hosted endpoints; it does not prove hosted Realtime publication, permissions, or Netlify routing have been configured correctly. Those require a hosted smoke test after account setup. No synthetic test used the copied snapshot or live board.

See `SETUP.md` for the remaining configuration steps.

## Official references checked September 24, 2026

- [Netlify build configuration](https://docs.netlify.com/build/configure-builds/overview/)
- [Netlify Functions execution model](https://docs.netlify.com/build/functions/overview/) and [runtime limits](https://docs.netlify.com/build/functions/configuration/)
- [Supabase database change subscriptions](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase Realtime allowances](https://supabase.com/docs/guides/realtime/pricing) and [Free plan details](https://supabase.com/pricing)
