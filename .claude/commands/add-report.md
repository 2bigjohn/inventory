Add a new metric or report card "$ARGUMENTS" to ReportsTab in src/App.jsx.

ReportsTab starts at ~line 2103. It receives these props:
items, purchases, liquor, lqTotals, totalFood, totalPurch, totalBev, totalBevSales,
bevSales, fcPct, bevPct, sales, walks, foodLow, liqLow, waste, settings, show,
wasteCost, snaps, recipes

Steps:
1. Compute the metric from the available props (or derive it inline in the JSX).
2. Add a card using the same card style pattern as existing report cards:
   - Container: `style={S.card}`
   - Header: `style={S.hd}` with `style={S.title()}`
   - Stat display: `fontFamily:mono, fontSize:28, fontWeight:700, color:C.amber`
3. If the metric needs a new prop not currently passed to ReportsTab, add it to
   the `P` object in `AppInner` (~line 506) and the `ReportsTab` function signature.

After changes, run `npx vite build` to confirm no errors.
