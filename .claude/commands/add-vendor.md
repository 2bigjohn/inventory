Add the vendor "$ARGUMENTS" to the Gmail scraping system in src/App.jsx.

Do all three of these:

1. **Gmail search query** — find the `q:` string inside `GmailImport` that lists vendors
   (search for `sysco` to find it). Add the new vendor name as a lowercase OR term, e.g.
   `"$ARGUMENTS"` → add `$ARGUMENTS` (lowercase) to the query.

2. **AI vendor guide** — inside the same `GmailImport` function, find the prompt text that
   lists known vendors and their categories. Add an entry for "$ARGUMENTS" with the
   appropriate category (Food - Protein / Produce / Dairy / Dry / Frozen, Supplies, etc.).

3. **SYSCO_CAT_MAP** (only if it's a broadline distributor like Sysco/US Foods) — in
   `PricesTab` find `SYSCO_CAT_MAP` and add any category name mappings specific to this
   vendor's CSV format.

After making changes, run `npx vite build` to confirm no errors.
