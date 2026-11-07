# Algorithm cost baseline and history

`algorithm-baseline.json` contains the frozen source sheet. It holds **14,899 algorithms, 377 cases, and 36 sections**, in the original sheet order. There are 35 sections after T0; T0 is retained as its own section rather than silently dropped. The source has four families: Trapezoids, Headlights, Diamonds, and Cat Chameleons.

The sheet's header is its last CSV row (14900), not its first. Import preserves every algorithm row and records the header position, source URL, retrieval time, original column names, and source CSV SHA-256. Each entry preserves all 12 source columns, with the original cost stored as both a number and source text. Source row numbers provide stable IDs.

- `caseNumber`, `caseName`, `caseGroup`: columns A, C, D.
- The section's `family`: column B.
- `referenceAlgorithm`: column E (Setup).
- `algorithm`: column F (the execution to compare).
- `baseline`: columns G–J (starting thumb, cost, rotation, AUF).
- `stm`, `solution`: columns K–L.

Do not recalculate or overwrite the baseline. It is what the sheet said when imported, even if its scores disagree with the current engine.

## View

Run from the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://localhost:8000/visual-changelog.html`. Select a section, expand a case card, search by case or moves, and click an algorithm to inspect its execution. Each case collapses independently; Expand all / Collapse all applies to visible cases. Open cards remain open while results refresh or you switch revisions. Historical revisions and live app results can both be inspected. The live calculation runs in a worker so it does not block the page while searching paths.

The baseline cost stays at the start of each row. Each saved change adds a signed delta from the preceding revision, with exactly two decimal places. A live delta follows the last saved change. The Current column shows the selected revision's absolute cost, plus its cumulative difference from the baseline.

Comparisons fix the sheet's **algorithm, orientation, and starting thumb**. They find the cheapest permitted fingertricks and regrips for that input. Algorithms are ranked only against alternatives in the same case; the comparison never silently chooses another starting grip. A row the current model cannot execute is marked unavailable, with its reason in the popup. Missing results are never treated as zero.

The sheet records total costs and starting grips, not original finger paths. The popup describes the selected app revision's actual path. Its move costs, regrip costs, repeated-finger penalties, and initial orientation cost reconcile to its total.

## Record each rule change

After changing and checking a scoring rule, append a named snapshot:

```sh
node scripts/snapshot-costs.mjs --id unique-change-name --label "What changed"
node --test tests/*.test.mjs
```

Commit the resulting history files with the corresponding code and `changelog.md` entry. The command uses the current files on disk; `baseCommit` is the Git HEAD it started from, and `sourceFingerprints` identify the actual uncommitted or committed calculation source. No Git commit or push is performed by the command.

`cost-history.json` is a small revision index. Execution results are in `history/<revision>/<section>.json`, loaded only when a section is viewed. Each result stores its absolute cost, delta from the original sheet, delta from the preceding revision, and complete execution trace. Move traces use tuples to reduce storage; `moveColumns` in the revision index lists their fields, and `unpackExecution` in `cost-ledger.js` restores objects.

The first snapshot, `eif-default`, compares the downloaded sheet with the current EIF model and optional-regrip engine. Its deltas are not an isolated estimate of the EIF change's effect; the sheet may predate other scoring changes. The actual recorded comparison is preserved.

The snapshot command refuses duplicate revision IDs, existing snapshot directories, and a changed baseline SHA-256. It writes section results before atomically appending the revision index. If a capture fails, the index does not advertise an incomplete revision. Inspect any partial directory before retrying with a new ID.

## Import provenance

The one-time import was:

```sh
python3 scripts/import-baseline.py --source 'https://docs.google.com/spreadsheets/d/15v0A0PipO8RcEeS7TFAaAv3dI1zBykaopkXQK_WnLo0/export?format=csv&gid=1131196825'
```

The importer refuses to overwrite an existing baseline. `--csv /path/to/download.csv` can supply the CSV bytes directly when recreating an independent copy. Replacing this baseline would require a separately versioned dataset and matching history, not editing the sheet costs in place.

## Case cards and position changes

`case-index.json` groups each section into its cases and lists each case's algorithm IDs in ascending baseline-cost order. It is derived from the frozen baseline and carries the same baseline SHA-256. It does not duplicate or change the original source values.

Each saved section snapshot includes a `cases` array listing algorithm IDs in ascending revision-cost order. Each score has `baselineRank`, `currentRank`, and `positionsGained`. A positive `positionsGained` means it moved up: baseline #7 to current #3 is **↑ 4**. Negative values mean positions lost. Zero means no change. Rankings compare the full case, so searching or filtering does not renumber them. Cases stay in source order.

Equal-cost entries use original sheet-row order as a deterministic tie-break. These are ordinal positions, not shared competition ranks. Unavailable results sort last and have null current rank and position change.

The snapshot command prepares these fields automatically for future revisions. To rebuild the derived case index or backfill ranking metadata in existing snapshots without rescoring them:

```sh
node scripts/prepare-case-rankings.mjs
```

This updates presentation metadata only. Original baseline bytes, historical costs, capture dates, and execution traces remain unchanged. Run it after a new independent one-time baseline import and initial snapshot before viewing that dataset.

For Live app, the worker evaluates and sorts a complete case once, then sends its results and prepared order to the page. Saved views read the prepared JSON order. Collapsed cards do not build their algorithm rows until expanded, and background calculation does not replace the card elements or reset their open state.
