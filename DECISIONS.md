# Decisions

Log of non-obvious decisions taken while modernizing the visualizer (branch `modernize`, Nov 2026,
done for the QfO benchmark service, which vendors `build/build.js` as `scatter.js`).

## Build tooling

- **webpack 4 → 5, webpack-cli 3 → 7, css-loader 1 → 7, style-loader 0.21 → 4.** webpack 4 does not
  run on current Node.js (OpenSSL 3 hashing) and css-loader's `minimize` option no longer exists.
  Build with `npm run prod` / `npm run dev`; the config is in `webpack.config.js` (no CLI flags).
  Requires Node ≥ 20 (`engines` in package.json).
- **Still a single self-contained `build/build.js`.** jsPDF loads html2canvas, canvg and dompurify
  with dynamic `import()`. `LimitChunkCountPlugin({maxChunks: 1})` inlines html2canvas (which we
  bundle anyway) instead of emitting a second chunk; `canvg` and `dompurify` are aliased to `false`
  (empty modules) because they are only needed for `doc.html()` / `addSvgAsImage`, which are unused.
- **License comments stay inside `build.js`** (`TerserPlugin({extractComments: false})`) instead of a
  separate `build.js.LICENSE.txt`, since consumers copy only `build.js`.
- Version bumped to **2.0.0**: `window.d3` is no longer set (see below), which could matter to pages
  that relied on the bundle exposing d3 globally.

## Libraries

- **jQuery removed.** It was only used for the viewport size (`$(window).width()/height()`), a few
  DOM manipulations, `$.inArray` and `.css()`. Replacements live in `src/utils.js`;
  `viewportWidth()/viewportHeight()` use `document.documentElement.clientWidth/Height`, which is
  exactly what jQuery returns for `$(window)`, so the chart layout is pixel-identical.
  `isEmptyElement()` keeps jQuery's semantics of `$("#x").is(":empty")` (false if the element does
  not exist), on which the download code relies.
- **d3 5 → 7.** Each module now imports d3 itself instead of using the global `window.d3` that
  `app.js` set. Changes needed:
  - event listeners receive `(event, datum)` instead of `(datum)`; `d3.event` no longer exists.
  - `d3.quantile` sorts its input since v6. `diagonals.js` passes scores sorted *descending* and the
    quartile assignment relies on the old positional behaviour, so it now uses
    `d3.quantileSorted`, which reproduces d3 5's results exactly (with plain `quantile`, the
    diagonal-quartile classification changed). `squares.js` uses `quantileSorted` too
    (same result there, input is sorted ascending).
  - `d3-transition` is imported explicitly for its side effect (it patches
    `selection.prototype.transition`): `d3` is marked side-effect free, so tree shaking dropped it and
    tooltips failed with `transition is not a function`.
  - d3-axis ≥ 2 draws axes with `currentColor` instead of `#000` (same rendering; visible in
    exported SVGs).
- **`d3-polygon` dependency removed**: `clusters.js` now takes `polygonHull` from `d3`
  (which re-exports d3-polygon).
- **apollo-fetch removed** (unmaintained since 2018). A 15-line `graphql_client()` in `app.js` posts
  `{query, variables}` with `fetch()`. Request failures are now caught and logged instead of
  surfacing as unhandled promise rejections.
- **jsPDF 1.5 → 4.2** (`import { jsPDF } from 'jspdf'`), **html2canvas 1.0.0-rc.5 → 1.4.1**:
  no API changes needed. `npm audit` reports 0 vulnerabilities (before: several in jsPDF and the
  webpack 4 toolchain).
- **d3-save-svg 0.0.2 kept**: unmaintained but tiny and dependency-free; still works. Imported via
  its named export `save`.
- **`clusters`, `pareto-frontier` kept** (small, no dependencies).

## Small fixes found on the way

- Showing a hidden participant again could remove the *last* entry of the hidden-tools list when the
  tool was not found (`splice(-1, 1)` after `$.inArray` returned -1); now guarded.
- `inline_data` is only `JSON.parse`d when it is a string (avoids a console warning per chart when the
  API returns an object).

## Verification

Compared old (`HEAD~1`) and new build headlessly in Chrome on the same recorded OpenEBench responses
(SwissTree, STD, GO, FAS datasets and an invalid id): number of dots/legend entries, axis ticks, SVG
size, legend click/hide, table-cell click, all three classifications (identical quartiles),
zoom toggle, and all four downloads (JSON, SVG, PNG, PDF) — results identical, screenshots visually
identical. Bundle: 924 kB → 766 kB (gzip 280 kB → 235 kB).
