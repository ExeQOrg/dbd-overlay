# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

**dbd-toolbox** (product name "DBD Toolbox") is a Tauri 2 desktop app for
Dead by Daylight. It watches the game window, OCRs the map name off
the loading screen, matches it against a library of community-made map
callout images, and displays the matching image as an on-screen/OBS overlay.

Two halves live in `App/`:

- **Frontend** — React 19 + TypeScript + Tailwind v4, built with Vite, routed
  with `react-router-dom` (`HashRouter`, required by Tauri's `index.html`
  loading model).
- **Backend** — Rust, in `App/src-tauri/`, using Tauri 2. Handles window
  capture, filesystem access, global shortcuts, and syncing the map pack from
  GitHub.

There is no server component and no database. Persistence is either the
filesystem (map images, synced from GitHub into the app data dir) or the
frontend's `localStorage` (all user settings).

## Repo layout

```
App/                    the whole application
  src/                  React frontend
    main.tsx            router setup, defines all routes
    Overlay.tsx          overlay window content (see "Windows" below)
    layout/
      MainLayout.tsx     sidebar + outlet shell for the main window
      Sidebar.tsx        nav: Gallery / Detect / Settings
      MapsSyncGate.tsx   blocks UI behind a loading screen during map sync
    pages/               one component per sidebar tab
    lib/                 non-component logic (see below)
    components/          small shared UI pieces (Accordion, Switch, etc.)
  src-tauri/             Rust backend
    src/lib.rs           ALL Tauri commands + app setup live here (one file)
    src/main.rs          trivial entry point, do not add logic here
    tauri.conf.json       window config, CSP, asset protocol scope
    capabilities/         Tauri ACL — permissions per window label
Maps/                    the actual map pack data, mirrored to GitHub
  <Creator>/<Family>/<MapName>.<ext>
```

`Maps/` at the repo root is the source of truth the *app* pulls at runtime —
see "Map pack sync" below. It is not bundled into the app build.

## Key architecture points an agent should know before editing

### `src-tauri/src/lib.rs` is a single file
All `#[tauri::command]`s, app setup (`.setup()`), window creation, and the
map-sync logic live in this one file. There is no module split yet. When
adding a command, follow the existing pattern (small struct for
input/output, `Result<T, String>` return type, errors converted with
`.map_err(|e| e.to_string())`) rather than introducing new error types.

### Three windows, one frontend bundle
The same Vite/React bundle serves three different Tauri windows, split by
hash route in `main.tsx`:
- `main` (default) — the sidebar app: Gallery / Detect / Settings.
- `overlay` — transparent, click-through, always-on-top; created in
  `create_overlay()` in `lib.rs` at startup, sized to the primary monitor.
  This is what you'd game-capture in OBS directly.
- `overlay-popout` — same `Overlay` component but with `chromaKey` on
  (green background) and normal window decorations, for OBS window/source
  capture instead of game capture. Opened on demand via the
  `open_obs_popout` command.

`Overlay.tsx` renders whatever the last `update-content` event carried
(`{ imageUrl }`), positioned/sized/opacity'd per `OverlaySettings`
(localStorage, `overlay-settings` key). Both overlay windows listen for the
same events, so anything pushed to one shows in the other.

### Detection flow (the core feature)
Owned by `DetectionContext.tsx`, consumed via the `useDetection()` hook.
Roughly:

1. `capture_screen_region` (Rust) finds the target window by title
   substring, screenshots it once, crops out every configured region, and
   thresholds each crop to black/white to help OCR.
2. The frontend runs each cropped region through a single shared
   `tesseract.js` worker (letters-only whitelist — digits never appear, see
   below).
3. `findBestMapMatch` (`lib/MapMatching.ts`) fuzzy-matches the OCR text
   against the gallery image list (Levenshtein similarity + whole-word
   substring check), preferring the user's `preferredCreator` before
   falling back to the full set.
4. On a match, an `update-content` event is emitted to the overlay windows.

Scans are triggered by: a registered global shortcut (`set_scan_shortcut`,
default `CommandOrControl+O`, re-registered from the frontend on every
launch since only the frontend persists it), a manual "scan now" action, or
the auto-detect loop (self-rescheduling `setTimeout`, guarded by a token so
toggling it doesn't race two loops — see the comment above that `useEffect`
in `DetectionContext.tsx` before touching it).

**Non-obvious constraint:** map names are OCR'd with a letters-only
whitelist, so trailing digits in filenames (e.g. `Preschool III` is stored
with a roman numeral, not `Preschool3`) are converted to Roman numerals for
matching (`normalizeWithRomanNumeral` in `MapMatching.ts`). Keep this in
mind if you touch matching logic or add maps.

### Map pack sync
The `Maps/` directory is **not bundled** with the app. On startup, Rust
(`sync_maps_with_repo` in `lib.rs`) checks the latest commit SHA touching
`Maps/` in `ExeQOrg/dbd-overlay` on GitHub, and if it differs from the
locally stored SHA (`maps-version.json` in the app data dir), downloads
every file under `Maps/` into a staging dir and atomically swaps it in. This
means:
- New maps ship by pushing to this repo's `Maps/` folder — no app release
  needed.
- `MapsSyncGate.tsx` blocks the main window behind a loading screen while
  this runs, but **fails open** on network errors so a bad connection
  doesn't lock users out of maps they already have.
- The directory structure (`Maps/<Creator>/<Family>/<MapName>.ext`, or
  `Maps/<Creator>/<MapName>.ext` with no family) is parsed by
  `collect_family_images`/`list_gallery_images` in `lib.rs` — keep the
  frontend's expectations (`GalleryImage { name, creator, family, path }`)
  and the Rust parser in sync if you change this shape.

### Settings are all client-side
`DetectionSettings`, `GlobalSettings`, and `OverlaySettings` (all in
`src/lib/`) are plain localStorage-backed stores with a `DEFAULT_*` constant,
a `load*` (parses JSON, merges over defaults, tolerant of missing/old
fields), and a `save*`. There is no Rust-side persistence for settings.
When extending a settings shape, add the field to the `DEFAULT_*` constant
and rely on the merge-over-defaults pattern for backward compatibility
rather than writing a migration.

## Commands

Everything runs from `App/`:

```bash
npm install          # install frontend deps
npm run dev           # vite dev server only (rarely what you want alone)
npm run tauri dev     # full app: Rust build + Vite + Tauri window(s)
npm run build          # tsc typecheck + vite build (frontend only)
npm run tauri build    # full production build (installers etc.)
```

Rust-only checks from `App/src-tauri/`:

```bash
cargo check
cargo build
```

There is currently no test suite (frontend or Rust) and no linter config
beyond TypeScript's own strict compiler options
(`noUnusedLocals`/`noUnusedParameters`/`strict` in `tsconfig.json`). Treat a
clean `npm run build` and `cargo check` as the correctness bar for changes
in each half.

## Conventions to follow

- **Styling**: Tailwind utility classes only; shared class strings live in
  `src/lib/Styles.ts` (`primaryButtonClass`, `panelClass`, etc.) — reuse
  those instead of re-deriving equivalent class strings inline.
- **Comments**: existing code favors sparse comments that explain *why*
  (a non-obvious constraint, a workaround, a race condition being guarded
  against), not *what*. Match that style — see almost any function in
  `lib.rs` or `DetectionContext.tsx` for the tone to match.
- **Rust error handling**: commands return `Result<T, String>`; convert
  errors with `.map_err(|e| e.to_string())` and let them surface to the
  frontend via the rejected `invoke()` promise. Don't introduce a custom
  error enum for a single command.
- **Frontend state**: no external state management library — React context
  (`DetectionContext`) plus localStorage-backed settings modules is the
  established pattern. Don't introduce Redux/Zustand/etc. for new state.
- Window/session-scoped state that must survive frontend reloads without
  racing an event listener attach (e.g. `MapsSyncStateStore`) is kept in
  Tauri managed state, mirrored to an event. Follow that pattern if you add
  something similar rather than relying on events alone.

## Things to double-check before finishing a change

- If you touched `capture_screen_region`, `list_gallery_images`, or any
  other `#[tauri::command]` signature, make sure the `invoke<T>(...)` call
  sites in the frontend still match (argument names are camelCase on the
  JS side, converted from Rust's snake_case by Tauri automatically).
- If you touched the `Maps/` directory shape, update both
  `collect_family_images`/`list_gallery_images` (Rust) and
  `GalleryImage`/consumers (`Gallery.ts`, `MapMatching.ts`) together.
- If you added a new Tauri command, confirm it's registered in the
  `tauri::generate_handler![...]` list in `lib.rs`'s `run()`, and check
  whether the relevant window's capability file in
  `src-tauri/capabilities/` needs it granted.
- Run `npm run build` (frontend) and `cargo check` (backend) before
  considering a change done — there's no CI here to catch issues for you.
