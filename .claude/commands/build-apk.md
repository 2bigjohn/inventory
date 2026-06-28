Prepare and trigger an Android APK build for the current changes.

Steps:
1. Run `npx vite build` locally to confirm the web build is clean.
2. Check that all changes are committed to `claude/app-testing-bugs-7zqhp0`.
3. If there are Capacitor plugin changes (new package.json entries), remind the user
   that `npx cap sync android` is run automatically by the CI workflow — no manual step needed.
4. Push to `origin claude/app-testing-bugs-7zqhp0` to trigger `.github/workflows/build-apk.yml`.
5. Report the push result and tell the user to watch the Actions tab for the
   `beacon-hills-inventory-debug` artifact (available for 30 days).

APK install reminder: if the signing key changed since the last install, the user
must uninstall the existing app on their Android device first, then install the new APK.
The debug keystore is committed at `android/beaconhills-debug.keystore` so signing
is now consistent across all CI builds.
