# tele-bucket

<!-- badges -->
[![build](https://github.com/sheikmohammedsha/tele-bucket/actions/workflows/build.yml/badge.svg)](https://github.com/sheikmohammedsha/tele-bucket/actions/workflows/build.yml)
[![release](https://github.com/sheikmohammedsha/tele-bucket/actions/workflows/release.yml/badge.svg)](https://github.com/sheikmohammedsha/tele-bucket/actions/workflows/release.yml)
![language: TypeScript](https://img.shields.io/badge/language-TypeScript-2f73bf)
![type: Cloud drive](https://img.shields.io/badge/type-Cloud%20drive-4c9e2f)
![storage: Telegram](https://img.shields.io/badge/storage-Telegram-d9733a)
![status: Active](https://img.shields.io/badge/status-Active-4c9e2f)
<!-- badges -->

> Google-Drive-style **drives** built on top of Telegram.

`tele-bucket` turns Telegram into shared cloud storage. Every **drive** is a
**private Telegram group**: upload a file and it is sent to that group as a
document, so every member of the group can open it — in this web UI *and*
directly in the Telegram app. No object-storage bill, no vendor lock-in.

This is a **hosted, multi-user service**:

- One person (the **owner**) provisions the Telegram app credentials once — they
  are stored in the server database, never in any browser.
- Everyone else signs in with just their **phone number**; Telegram sends the
  login code, and each account keeps its own sessions and private settings on
  top of Telegram.
- A single shared SQLite database keeps the metadata **index per drive**: every
  member of a drive sees the exact same files and folders from any client. The
  files themselves always live in Telegram.

## Features

- **Multiple drives** — each drive is its own private Telegram group, like a
  Google Drive *shared drive*.
- **Add members by phone number** — invited people can view *and upload* files
  in the drive, from this app and Telegram.
- **Phone-only sign in** — the owner configures the API credentials once via the
  UI; every other user just enters their phone + login code (optional 2FA).
- **Large-file support** — files over 100 MB are **split in the browser** into
  100 MB documents and **merged back in the browser on download**, with live
  progress; the server never assembles the whole file (no more fixed
  per-message size limits, and no server load for big transfers).
- **One shared index, no manifests** — the drive's file/folder tree lives in the
  shared database, so any member of the drive sees the same files on any client
  instantly. Nothing is posted to the channel besides the file documents
  themselves.
- **Scanning legacy files** — old chunked uploads announced themselves with a
  manifest message in the channel; **Scan** still reads those back so files
  uploaded before this change (or directly in Telegram) can be re-indexed.
- **Copy between drives** — forward a file from one drive to another (single and
  chunked files); the copy is indexed in the target drive's shared tree.
- **Drive-style UI** — breadcrumb folder navigation, search and a used-space
  meter (storage is treated as unlimited; no fake quota bar).
- **Upload files** (single or multi-select, drag & drop), **folders** (structure
  preserved), **download**, **nested folders**, and **recursive delete** that
  also removes the Telegram messages.
- **Honest privacy** — a user's own database records (who signed in, when, from
  where) are never shown to other users; the only shared data is the file index
  of drives the user is actually a member of. No telemetry, analytics or
  third-party calls — the only network traffic is MTProto to Telegram and the
  browser talking to this app's own API routes.

## How it works

Telegram's MTProto client API is used directly (via `teleproto`).

### Authorization (Phase 1 — multi-user)

1. The **owner** enters the Telegram app **API ID / API hash** once
   (`POST /api/auth/setup`). These are kept in the `settings` table on the
   server and are never returned to a browser.
2. Every browser then signs in with a **phone number**:
   `POST /api/auth/start` sends the code, `POST /api/auth/code` (and, for 2FA,
   `POST /api/auth/password`) finalize it. The MTProto session is stored per
   user in the `users` table.
3. The browser's only credential is a random **`tb_session` cookie**
   (HttpOnly, SameSite=Lax, 90 days) linked to the signed-in user via the
   `web_sessions` table. The first successful sign-in becomes the **owner**
   (recorded in `settings.owner_user_id`) and adopts any legacy index rows.
4. Every API route resolves the user from that cookie (`requireUserId`), so no
   user can reach another user's private records, and the Telegram API hash is
   never exposed to the client. Shared-drive endpoints additionally verify the
   caller is a **member** of the drive (`requireDriveMember`, cached ~60 s
   against the Telegram dialog list) before returning any file index, download,
   upload or delete.

### Drives (shared groups)

When you create a drive the app calls `channels.createChannel` with
`megagroup: true`, making a **private supergroup** where every member can view
and upload files. Only channels created **through the app** (recorded in the
`drives` table) are shown — other channels on the account never appear — and a
drive's contents are only readable by accounts that are actually members of it.

### Shared index & privacy

The file/folder tree of a drive is stored **once, per drive**, in the shared
SQLite database (`items` + `chunks`). That is what lets the same drive look
identical on every member's device — no per-user state to reconcile, no
manifest messages to scan. Access control is the drive itself:

- **Any member of the drive** — by definition they can already see the channel
  in Telegram — sees the drive's index in the app.
- **Non-members** are rejected with `403` at the API layer, even if they guess a
  file id.
- **Everything else in the database** (sessions, login records, the owner's
  credentials, other members' data) is never exposed to anyone but the owner
  path.

### Large files (Phase 2 — chunking)

Telegram caps a single document per-message at well under 4 GB, so files larger
than **100 MB** are handled like this:

1. The **browser** splits the file into **100 MB parts** and uploads each one
   independently (`POST /api/upload/part`), so the server never holds more than
   one part in memory.
2. The browser reports the resulting message ids to
   `POST /api/upload/complete`, which writes a single `items` row plus one
   `chunks` row per part into the **shared index**.
3. On **download** the browser requests each part by sequence
   (`GET /api/download?id=…&seq=N`), shows progress, then merges them into the
   final file locally.
4. On **delete** the part messages are revoked from the channel as well.
5. **Scan** is kept purely for legacy: it reads old
   `+TB-BUCKET-MANIFEST:v1:{...}` messages posted by earlier versions and
   re-indexes those chunked files. New uploads never post manifests.

Small files (≤ 100 MB) go up as a single Telegram document with zero overhead.

### Local database

Telegram does not expose a free-form index of your message media, so the app
keeps its metadata in a **local SQLite database** (`.data/telebucket.db`):

- `drives` — one row per app-created drive (channel id + access hash + title).
- `items` — the **shared, per-drive** file/folder index (name, size, parent
  folder, drive, chunk count, SHA-256). Legacy rows may also carry a manifest
  message id.
- `chunks` — part → Telegram message id mapping for chunked files (shared too).
- `users` — one row per signed-in Telegram account (public info + MTProto
  session). Never shared.
- `web_sessions` — browser session tokens (`tb_session`). Never shared.
- `pending_logins` — in-flight phone → code logins (15-minute expiry).
- `settings` — the owner's API credentials and the owner user id.

The channel **access hash** is only ever sent to Telegram inside MTProto
requests; it is never exposed to the browser. `.data/` is git-ignored, so no
credentials or metadata are ever committed.

## Requirements

- **Node.js 24+** — the app uses the built-in `node:sqlite`.

## Getting started

### 1. Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

### 2. Provision (owner, one time)

The first screen asks for the **API ID** and **API hash** from
https://my.telegram.org. These are saved to the server database and never touch
the browser again. (Alternatively set `TELEGRAM_API_ID` / `TELEGRAM_API_HASH`
in `.env.local` — env wins over the DB.)

### 3. Sign in

Everyone (including the owner, on subsequent visits) enters:

1. **Phone number** — the code is sent by Telegram.
2. The **login code** (and the 2FA **password**, if enabled).

Then create your first **drive**, add members by phone number, and start
uploading. Every member of a drive sees the same files and folders; anything
that is not part of a shared drive stays private to its account.

## Scripts

| Command            | Description                          |
| ------------------ | ------------------------------------ |
| `npm run dev`      | Start the dev server                 |
| `npm run build`    | Production build (standalone output) |
| `npm start`        | Serve the production build           |
| `npm run lint`     | ESLint                               |
| `npx tsc --noEmit` | Type check                           |

## CI / building a deployment package

`next.config.ts` sets `output: "standalone"`, so `npm run build` produces a
self-contained server in `.next/standalone`. The CI workflows assemble a
ready-to-run package (`.next/standalone` + `.next/static` + `public`) and
explicitly strip the local `.data/` database and env files so no session or
credentials ever ship:

```bash
npm ci
npm run build
# assemble: .next/standalone + .next/static + public, remove .data/ and .env*
node server.js      # from the assembled folder, Node 24+
```

- **`build.yml`** — runs on **every branch** (and on demand). Uploads the
  deployment package as a workflow artifact: **Actions → the run → Artifacts**.
  GitHub auto-zips it on download.
- **`release.yml`** — runs when a **tag** is pushed (`git tag v0.1.0 && git push
  origin v0.1.0`). Attaches the deployment zip to a **GitHub Release**: repo →
  **Releases** → the tag → **Assets**.

## File size limits

| Account           | Per-file upload limit |
| ----------------- | --------------------- |
| Telegram (free)   | 2 GB                  |
| Telegram Premium  | 4 GB (app caps at 2 GB) |

Files above 100 MB are chunked (see above), so the app's practical limit is the
account's per-upload size.

## Project layout

```
src/
├── app/
│   ├── api/                 # Next.js route handlers
│   │   ├── auth/            # status / setup(owner) / start / code / password / logout
│   │   ├── drives/          # GET list drives, POST create drive
│   │   │   ├── [driveId]/members/  # POST invite a member by phone
│   │   │   └── [driveId]/rescan/   # POST re-index legacy manifest files
│   │   ├── forward/         # POST — copy a file into another drive
│   │   ├── upload/          # POST — single file ≤ 100 MB
│   │   │   ├── part/        # POST — one ~100 MB part (browser-split upload)
│   │   │   └── complete/    # POST — finalize an assembled multi-part upload
│   │   ├── download/        # GET  — one document, or one part (?seq=N)
│   │   ├── files/           # GET  — list / search within a drive
│   │   ├── folders/         # POST — create folder
│   │   └── delete/          # POST — delete item (and descendants, incl. parts)
│   ├── page.tsx             # App shell / state (upload + download progress)
│   └── layout.tsx           # Theme pre-paint + provider
├── components/              # Setup form, Drive UI, FileItem, modals, tour, icons
├── lib/
│   ├── telegram.ts          # MTProto clients, phone login, drives, membership, uploads
│   ├── chunking.ts          # Shared CHUNK_SIZE constant for browser + API
│   ├── db.ts                # SQLite schema + connection
│   ├── store.ts             # SQLite-backed index (shared per drive)
│   ├── auth.ts              # Web-session cookie helpers
│   ├── backends/            # client-side API wrappers (split/merge + progress)
│   ├── client.ts            # UI-facing API + auth helpers
│   └── format.ts
└── types/
```

## License

MIT — see [LICENSE](./LICENSE).