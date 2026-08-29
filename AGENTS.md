This file provides guidance to AI agents when working with code in this repository.

## Project

Chrome extension (Manifest V3) that injects a summary footer into the Laps/Intervals table on Garmin Connect activity pages (`https://connect.garmin.com/*`). When the user selects laps, it computes average time, total time, total distance, average pace, and time-weighted average lap power.

## Commands

- `npm run build` — production webpack build; emits `dist/` and `dist/package/garmin-splits-calculator.zip` (upload to Chrome Web Store).
- `npm run build:dev` — development build with source maps.
- `npm run watch` — webpack watch mode; load `dist/` as an unpacked extension in `chrome://extensions` and reload after each rebuild.
- Node 24 is required (enforced via `engines` in `package.json`).

There is no test runner wired up despite `jest` being a devDependency, and there is no lint script — formatting is Prettier only (`.prettierrc`).

## Architecture

Single content script (`src/main.ts` → bundled as `dist/main.js`) injected into Garmin Connect. `assets/manifest.json` and `assets/icons/` are copied verbatim into `dist/` by `CopyWebpackPlugin`, so any manifest change happens in `assets/`, not `dist/`.

Runtime flow:

1. `src/main.ts` sets up a `MutationObserver` on `document.body` waiting for the splits table (`#tab-splits table`) to appear. Garmin's SPA re-renders on navigation, so the observer also re-arms itself when `div.page-navigation > button` (prev/next activity) is clicked.
2. Once the table exists, `initSummaryReport()` in `src/intervals-table.ts` snapshots the column headers into a `columnIndexes` map and binds a `tbody` click handler.
3. On each lap-row click, `showSummary()` reads currently selected rows, computes aggregates via `getData()`, and appends/replaces a `<tr id="interval-summary">` inside the table's `<tfoot>`. Cells are placed by matching `columnIndexes` keys (`Time`, `Cumulative Time`, `Distance`, `Avg Pace`, `Lap Power`, `Interval`) so the summary stays column-aligned regardless of Garmin's column order.

Two table variants must be handled and are distinguished in `isIntervalTable()`:

- **Interval workouts** — table class starts with `IntervalsTable_table`; selected rows match `tr[class*="Table_selected"]`. Sub-lap rows are detected and shifted by one cell to realign with the parent's columns.
- **Plain lap tables** — class starts with `SortableTable_table`; selected rows match `tr.active[class*="SortableTable_tableRow"]`.

Because everything hinges on Garmin's CSS class prefixes and DOM structure, breakage after a Garmin UI change usually means updating the selectors in `getIntervalsTable()`, `isIntervalTable()`, and the two header selectors in `initSummaryReport()` (`th > span:first-child` for intervals, `th > div > span:first-child` for laps).

Time parsing (`src/utils.ts`) uses the `duration-pattern` library. Lap times may or may not include hours; `parseTime()` picks the format based on colon count and pads sub-second precision for the no-hours case. Average pace = cumulative ms / total km, formatted as `m:ss.S`. Average power is time-weighted (Σ time·power / Σ time), not a plain mean.

## Styling

`src/styles/main.scss` is imported by `main.ts` and injected via `style-loader` at runtime — no separate CSS file ships in `dist/`.
