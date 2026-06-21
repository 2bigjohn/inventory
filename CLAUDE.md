# Beacon Hills Inventory — Project Context

## What this is
A restaurant inventory management app for Beacon Hills / New Standard Hospitality.
Built as a React 19 + Vite 8 SPA, packaged as an Android APK via Capacitor 8.

## Repo & branches
- Repo: `2bigjohn/inventory`
- Active feature branch: `claude/app-testing-bugs-7zqhp0`
- Never push to `main` without explicit permission
- GitHub Pages: `https://2bigjohn.github.io/inventory/`

## Tech stack
- **Frontend:** React 19, Vite 8, plain inline styles (no CSS framework)
- **Android:** Capacitor 8, package ID `com.beaconhills.inventory`
- **Storage:** `localStorage` (primary) + `@capacitor/preferences` (Android backup)
- **AI:** Claude API via `@anthropic-ai/sdk` (Anthropic key stored as `bh_apikey_v6`)
- **Gmail:** OAuth 2.0 — GIS popup on web, PKCE + Chrome Custom Tabs on Android

## Architecture — single file
All app logic is in `src/App.jsx` (~2400 lines). Do not split into components.
Each major screen is a top-level function: `CountTab`, `WalkTab`, `ScanTab`, etc.
State lives in `AppInner`; props are passed down via the `P` spread object.

## Key constants in src/App.jsx
| Constant | Line | Purpose |
|---|---|---|
| `V` | ~13 | Storage version string (`"v6"`) — bump to wipe all stored data |
| `KEYS` | ~14 | localStorage key names |
| `CATS` | ~66 | Food inventory categories |
| `UNITS` | ~67 | Unit options (ea, lb, cs, …) |
| `VENDORS` | ~68 | Distributor dropdown options |
| `BCATS` | ~69 | Bar item categories |
| `DEFAULT_WALKS` | ~74 | Walk locations created on first launch |
| `DEFAULT_SETTINGS` | ~80 | Default targets (food cost 29%, bev 22%) |
| `SYSCO_CAT_MAP` | ~1822 | Maps Sysco CSV categories → app categories |

## Storage helper (`LS`)
```js
LS.get(key, fallback)   // reads localStorage, JSON-parsed
LS.set(key, value)      // writes localStorage + Capacitor Preferences (async, fire-and-forget)
LS.restore()            // called once at startup on Android to restore from Preferences
```
Non-settings API keys are stored directly in localStorage (not in KEYS):
`bh_apikey_v6`, `bh_gclientid_v6`, `bh_gclientid_android`, `bh_gclientsecret_android`

## Android / Capacitor
- Debug keystore: `android/beaconhills-debug.keystore` (alias: beaconhills, pass: beaconhills123)
- APK CI workflow: `.github/workflows/build-apk.yml` — triggers on push to feature branch
- Vite base for APK builds: `base=/` (not `/inventory/`)
- File type detection: always use extension fallback — `file.type` is often empty in the WebView
- To save files on Android: `@capacitor/filesystem` write to `Directory.Cache` → `@capacitor/share`
- OAuth redirect scheme: `com.googleusercontent.apps.326188122408-ut2h6tudoc5ctst9o2eu092fes3l7445`

## Build commands
```bash
npm run dev                        # local dev server
npx vite build                     # web build (base=/inventory/)
npx vite build --base=/            # APK build
npx cap sync android               # sync web assets into Android project
```

## Coding conventions
- No comments unless the WHY is non-obvious
- No new files — edit existing ones
- Inline styles only, using the `C` color palette and `S` style helpers at the top of App.jsx
- All monetary values formatted with `fmt$()`, percentages with `fmtPct()`
- New items get IDs from `uid()` (also defined at top of App.jsx)
- After any App.jsx change: run `npx vite build` to verify before committing

## Gmail scraping
Lives in `GmailImport` (~line 1387). Key things:
- Gmail search query targets: sysco, us foods, gordon, performance food, loffredo, fortune fish, reinhart, chef's warehouse, pfg, rndc, southern glazer, breakthru, cintas, ecolab, plus subject:invoice/statement/delivery
- Processes 50 emails per page with nextPageToken pagination
- AI batch size: 4 emails per Claude call to stay within token limits
- Results accumulate across pages; shown in PurchasesTab

## Roles
- `admin` — full access
- `manager` — no settings tab
- `counter` — count, walk, scan tabs only; no financial figures shown
