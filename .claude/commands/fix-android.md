Diagnose and fix the Android issue: "$ARGUMENTS"

## Android-specific context for this app

**File handling**
- `file.type` is often empty in the Capacitor WebView — always detect MIME from extension
- Pattern: `const mime = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')`
- AI image content: `{type:"image", source:{type:"base64", media_type:mime, data:b64}}`
- AI PDF content: `{type:"document", source:{type:"base64", media_type:"application/pdf", data:b64}}`

**File saving / sharing**
- `navigator.share({files})` does NOT work in Capacitor WebView
- Use `@capacitor/filesystem` writeFile to `Directory.Cache` + `@capacitor/share` Share.share({url})

**Storage**
- `localStorage` can be cleared by Android when the app cache is cleared
- All writes go through `LS.set()` which mirrors to `@capacitor/preferences` automatically
- On startup, `LS.restore()` checks localStorage first, then falls back to Preferences

**OAuth / Gmail**
- Web: Google Identity Services popup (`google.accounts.oauth2.initTokenClient`)
- Android: `@capacitor/browser` opens Chrome Custom Tab for PKCE flow
- Redirect URI scheme: `com.googleusercontent.apps.326188122408-ut2h6tudoc5ctst9o2eu092fes3l7445:/oauth2redirect`
- Token exchange requires `client_secret` even with PKCE (Desktop app OAuth client type)

**Loading / startup**
- `App` component shows a loading screen while `LS.restore()` runs
- If restore finds data, it calls `window.location.reload()` to re-init React with data
- 3-second timeout prevents getting stuck if the Preferences plugin fails to load

**APK signing**
- Debug keystore: `android/beaconhills-debug.keystore`
- "Package conflicts" error = different signing key — user must uninstall old APK first

Investigate the reported issue ("$ARGUMENTS"), identify which of the above areas it falls into,
and apply a fix. Run `npx vite build` to confirm before committing.
