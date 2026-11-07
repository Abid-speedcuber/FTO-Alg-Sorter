# Algorithm baseline and cost history

The initial application baseline was calculated with the parent application at commit **849832601fc6febc878d3513f7007d3fc38f25e9** ([parent commit](https://github.com/mihlefeld/FTO-Alg-Sorter/commit/849832601fc6febc878d3513f7007d3fc38f25e9)). This is the parent repository's `main` as verified on 2026-11-07 and includes optional regrips. The commit is pinned; later parent updates do not silently change the baseline. Use `./shift-baseline.sh` to explicitly advance the active baseline to the current on-disk system, as described below.

All **14,899 algorithms, 377 cases, and 36 sections** retain their sheet move strings, orientations, starting thumbs, setup algorithms, solutions, source row IDs, and section order. There are 35 sections after T0; T0 is retained too.

## Baseline provenance

`algorithm-baseline.json` is the active dataset. Its definition can describe the initial pinned parent commit or a later working-tree checkpoint. `baselineDefinition` records the exact parent repository, commit, calculation time, source-file SHA-256 hashes, comparison settings, and original sheet archive hash.

Each `baseline.cost` is the cheapest cost found by that exact parent engine for the sheet algorithm and its recorded starting thumb. `baseline.costText` formats the calculated value. Original sheet values are retained in `sheetCost.cost` / `sheetCost.costText`; they are reference data, not the comparison baseline.

The original imported baseline is preserved byte-for-byte at `archive/sheet-baseline.json`. Its old history index is at `archive/sheet-history-index.json`. The sheet export used a slightly different scoring implementation; 8,560 of its costs differ from the recalculated parent baseline. For example, sheet row 9102 records 11.60, while the parent and current app both calculate 11.20.

The original sheet's header is CSV row 14900, not row 1. The archive records the source URL, retrieval time, column names, and CSV SHA-256. All 12 source columns remain available:

- `caseNumber`, `caseName`, `caseGroup`: columns A, C, D; section `family`: column B.
- `referenceAlgorithm`: column E (Setup); `algorithm`: column F.
- `baseline.startThumb`, `sheetCost`, `baseline.rotation`, `baseline.auf`: original columns G–J.
- `stm`, `solution`: columns K–L.

## View

From the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://localhost:8000/visual-changelog.html`. Select a section, expand a case, and click an algorithm for its fingertricks and cost breakdown. Each case collapses independently. Search/filter controls leave full-case positions unchanged. The page shows the pinned parent commit above the metrics; the popup also shows the original sheet cost for reference.

The active captured baseline cost starts each row. Each saved revision adds a signed two-decimal delta from the preceding revision, followed by the live app delta. The Current column shows the selected revision's absolute cost and cumulative difference from the parent baseline.

Comparisons keep the **algorithm, orientation, and starting thumb** fixed. Each engine searches its cheapest permitted fingertricks and regrips for that input. Missing executions are explicitly unavailable with null cost, never zero.

## Saved revisions

`cost-history.json` indexes revisions. `history/<revision>/<section>.json` contains each section's complete execution traces, absolute costs, baseline deltas, preceding-revision deltas, and rankings. Move traces use tuples; `moveColumns` lists their fields, and `unpackExecution` in `cost-ledger.js` restores objects.

The existing `eif-default` snapshot was rebased against the pinned parent costs without changing its historical execution paths or absolute scores. All 14,899 results match this parent baseline, giving zero cost and position changes. Previously displayed improvements were differences from the sheet's alternate scoring implementation.

To preserve a scoring-rule change within the current comparison period, record it with:

```sh
node scripts/snapshot-costs.mjs --id unique-change-name --label "What changed"
node --test tests/*.test.mjs
```

Commit the snapshot and changelog with the rule change. Capture uses files on disk; `baseCommit` identifies Git HEAD and `sourceFingerprints` identify the actual calculation source. It performs no Git commits or pushes. Duplicate IDs, existing snapshot directories, and unexpected baseline hash changes are rejected.

## Case order and positions

`case-index.json` precomputes case groups and ascending parent-baseline cost order. Each snapshot's `cases` array stores the selected revision's sorted entry IDs. Scores include `baselineRank`, `currentRank`, and `positionsGained`: baseline #7 to current #3 means **↑ 4**; a negative value means positions lost.

Ranks are ordinal within one case. Equal costs use sheet-row order as a stable tie-break. Unavailable results sort last and have null current rank and position change. Cases stay in source order.

Saved views read prepared JSON orders. Live evaluation and ranking happen case by case in a worker. Collapsed cards build their algorithm rows only when expanded; refreshes preserve card open states.

To regenerate presentation indexes without changing baseline values or rescoring history:

```sh
node scripts/prepare-case-rankings.mjs
```

## Explicit baseline migration

The authorized one-time correction from sheet costs to parent application costs was:

```sh
node scripts/recalculate-baseline.mjs --commit 849832601fc6febc878d3513f7007d3fc38f25e9 --repository https://github.com/mihlefeld/FTO-Alg-Sorter
```

It extracts and executes the three calculation modules from that exact Git commit in a temporary directory. It never uses the working-tree engine to calculate parent baseline costs. All calculations and score validation complete before active data is changed. It archives the original sheet, replaces baseline costs, and rebases saved deltas/rankings while preserving historical absolute scores and executions.

This original sheet-correction command refuses to rerun on an already recalculated baseline. For routine baseline advances, use `shift-baseline.sh` instead.

`scripts/import-baseline.py` is the original one-time source importer; it refuses to overwrite an existing active baseline. Preserve its raw output when recreating an independent dataset, then perform an explicit pinned-code baseline calculation before using sheet costs for app comparisons.

## Full algorithm dump

Choose **Full alg dump** at the top of the sidebar. This view includes all 14,899 algorithms together, without case/section grouping, sorted by selected execution cost ascending. It shows every matching algorithm in one continuous list; search and filters apply to the entire dataset. Rows are appended automatically in small batches to let the page respond while the full table is being built. No page buttons or scrolling trigger are required. Clicking any entry opens the same fingertrick/cost popup.

Position gains/losses in this view compare **global** positions against the global active baseline. Section views retain their case-specific positions. Equal costs keep original sheet-row order; unavailable results are last and unranked. Filtering never renumbers positions.

`case-index.json.global.entryIds` stores baseline order across the full dump. Each revision's `globalFile` points to a compact JSON file containing its prepared order, score summaries, and global position changes. Historical traces load only when opened. Live calculation/ranking runs in the worker. The complete table is built in batches; its progress reports the number actually displayed.

## Shift baseline to isolate the next change

When the current rule/model is the reference point you want to keep:

```sh
./shift-baseline.sh
```

An optional label makes older periods easier to identify:

```sh
./shift-baseline.sh --label "After accepting the new U rule"
```

The executable wrapper works from any directory. It requires Bash, Node, and Git; it performs no commit, push, or deployment.

A shift:

1. Freezes the current on-disk source, including uncommitted changes, then evaluates every algorithm with that frozen model.
2. Closes the previous comparison period with a full score/trace snapshot, even if you did not manually capture the latest rule.
3. Saves the previous baseline, its full history, and both the previous-baseline scoring source and newly captured source in `data/baseline-epochs/<id>/`.
4. Promotes current costs and rankings to the new active baseline and starts an empty revision history. Unchanged code now produces +0.00; the next rule's impact excludes earlier accepted changes.
5. Adds the old period to `data/baseline-epochs.json`. After refreshing, use **Baseline period** in the page to review it. Archived periods open on their closing captured revision; their optional live view is explicitly labeled as today's app versus that older baseline.

Archives contain `before/algorithm-baseline.json`, `before/cost-history.json`, `before/case-index.json`, archived section/global snapshots, and `systems/previous-baseline` / `systems/current`. Source hashes identify exactly what was captured; Git HEAD alone does not describe uncommitted code. Original sheet costs remain provenance through every shift.

The command refuses to advance if any algorithm cannot be evaluated, source/data changes during capture, a baseline/hash mismatch is detected, or the requested `--id` already exists. It calculates and archives before replacing active data, uses a lock to prevent simultaneous shifts, and attempts rollback if installation fails. A failed rollback preserves recovery copies and reports their location. Do not remove an interrupted-run lock without checking that no capture is still running.

The command has been tested on temporary repositories; creating it did not itself shift the real dataset. Existing unreferenced snapshot directories are retained, so continue using unique snapshot IDs rather than reusing a previous period's name.
