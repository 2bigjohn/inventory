Add a new inventory category "$ARGUMENTS" to the app in src/App.jsx.

1. **CATS array** (~line 66) — append "$ARGUMENTS" to the list.

2. **autoAssign** (~line 126) — add a routing rule in the `CAT_WALK` map so items
   with this category land in the correct default walk. Use an existing walk ID
   (w-walkin, w-dry, w-freeze, w-bar) or create a new one if needed.

3. **SYSCO_CAT_MAP** (~line 1822) — if this category corresponds to a Sysco/distributor
   CSV category name, add the mapping.

4. **ItemsTab / ItemRow** — check that the category dropdown (`CATS.map(...)`) doesn't
   need any special handling for the new category.

After changes, run `npx vite build` to confirm no errors.
