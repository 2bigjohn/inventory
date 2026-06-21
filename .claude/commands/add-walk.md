Add a new storage walk location "$ARGUMENTS" to the app in src/App.jsx.

1. **DEFAULT_WALKS** (~line 74) — add a new entry:
   ```js
   {id:"w-<slugified-name>", name:"$ARGUMENTS", emoji:"<appropriate emoji>", itemIds:[]}
   ```
   Pick the emoji based on what's stored there (🧊 freezer, 🍷 bar, 📦 dry, 🥩 cooler, etc.)

2. **CAT_WALK map** (~line 84, inside autoAssign) — map any relevant food categories
   to this new walk ID so items auto-assign correctly.

3. **WALK_EMOJI** (~line 91) — add a regex pattern if the walk name has a distinctive
   keyword so the emoji auto-detects on import.

After changes, run `npx vite build` to confirm no errors.
