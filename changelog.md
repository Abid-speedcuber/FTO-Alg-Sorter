# Changelog

This fork is a workspace for experimenting with FTO fingertrick rules. Changes can accumulate here and be reviewed as a batch before selected work is contributed to the parent repository.

Fork: [Abid-speedcuber/FTO-Alg-Sorter](https://github.com/Abid-speedcuber/FTO-Alg-Sorter)
Parent: [mihlefeld/FTO-Alg-Sorter](https://github.com/mihlefeld/FTO-Alg-Sorter)

## Review workflow

- Develop freely on `development`; a pull request is not required for each rule.
- Record meaningful behavior changes here, including the reason and a before/after example when useful.
- New experiments start as **Pending review**. Record **Approved**, **Needs changes**, or **Discarded** after review; do not assume that implementation or passing tests means approval.
- Check the affected behavior and run relevant tests before marking an implementation ready for review.
- After every scoring-rule change, append a named visual cost snapshot with `node scripts/snapshot-costs.mjs --id unique-change-name --label "What changed"`. Preserve the original sheet baseline and commit the snapshot with the rule change.
- Collect approved changes on a contribution branch based on the latest `upstream/main`, then open one pull request for the selected batch.
- Prefer focused commits so individual experiments can be selected or omitted later. If changes depend on each other, record that dependency before contributing them.

## Unreleased

### 2026-11-07 — Starting regrip penalty at {U,R}

- Review: Pending review for contribution to the parent.
- Rule: For executions in `{U,R}`, charge the starting thumb once: `back+` +0.40, `back-` +0.50, `front`/`bottom` +0.00. Other orientations receive no starting charge.
- Scoring: Apply the fee before comparing starting grips. It does not consume the optional-regrip budget or add another charge when a later move/regrip enters a back position.
- Configuration: Store the defaults in `EIF.startingRegripCosts`. Older uploaded configs without this field inherit the new defaults; explicit config values can customize them.
- Explanation: Store `startingRegripCost` in each execution. Show it separately from rotation, move, and later regrip costs in the execution popup and sorter. Older recorded traces default to zero rather than inheriting a new retrospective charge.
- Snapshot: Capture `starting-regrip` against the existing parent baseline. Exactly 2,226 `{U,R}` back+ entries increase by 0.40 and 634 back- entries by 0.50; the remaining 12,039 entries are unchanged. All fingertrick paths remain identical for their fixed starting grips. Case/global position changes are recalculated in the saved snapshot.
- Checks: All 32 tests pass, including scope, one-time application, ranking, later wrist/manual regrips, legacy config/trace compatibility, and saved-cost reconciliation. Audit all 14,899 results against the preceding snapshot to confirm exactly the expected fees and unchanged move paths. JavaScript syntax and whitespace checks pass.
- Baseline: Not shifted; this rule remains visible as an isolated change from the current baseline.
- Commit(s): Not committed yet.

### 2026-11-07 — Show the complete algorithm dump continuously

- Replace the 100-row pagination with one continuous list containing every matching algorithm, ordered by global cost.
- Append rows automatically in 250-row batches, keeping controls responsive while the complete table is built. Cancel outdated batches on searches, filters, section/revision changes, or baseline-period changes.
- Wait for complete global rankings before building the table, and display the actual rendered row count. Preserve global position changes and execution popups for all entries.
- Validation: JavaScript syntax and page references checked; existing ranking, history, and baseline-shift tests pass. Browser verification remains unavailable without a connected browser.


### 2026-11-07 — Full dump and baseline shifts

- Review: Pending review for contribution to the parent.
- Full dump: Add an uncategorized view of all 14,899 algorithms, sorted by selected cost ascending. Show global baseline/current positions and positions gained/lost; case views keep their separate within-case ranks. Use 100-row pagination, full-dataset search/filtering, and existing execution popups.
- JSON: Prepare global baseline order and revision score/rank indexes. Keep execution traces lazy; calculate live global rankings in the worker. Preserve deterministic sheet-row tie order and unranked unavailable results.
- Baseline command: Add executable `shift-baseline.sh` (optional `--label` / `--id`). It freezes and evaluates current on-disk source, closes the old period with a final snapshot, archives its baseline/history and both scoring systems, promotes current costs to the baseline, and starts a fresh comparison period at zero.
- Older systems: Preserve pinned Git source for the initial baseline and exact working-tree source for later baselines, including uncommitted files and source hashes. Add a Baseline period selector to inspect archived comparisons. No Git commit/push is performed by the command.
- Safeguards: Validate hashes, reject unavailable results and concurrent source/data changes, serialize shifts with a lock, and retain recovery archives if rollback fails. Original sheet provenance is preserved.
- Checks: All 27 tests pass, including every prepared global rank, cross-case movements, two successive baseline shifts, pinned/working-tree source preservation, old snapshot accessibility, isolated next-rule deltas, duplicate IDs, and failure leaving the baseline intact. Shell and JavaScript syntax checks pass. Browser verification is unavailable without a connected browser.
- Active baseline: The real dataset was not shifted during implementation; promotion tests used temporary repositories only.
- Commit(s): Not committed yet.

### 2026-11-07 — Recalculate baseline from the parent application

- Review: Pending review for contribution to the parent.
- Reason: The sheet's cost column came from a different, simplified scoring implementation. It is unsuitable for attributing app changes.
- Baseline: Recalculate all 14,899 inputs with the actual parent repository at `849832601fc6febc878d3513f7007d3fc38f25e9`, verified as its current main. Execute pinned Git source in a temporary directory; preserve algorithm, orientation, and starting grip for every row. This parent commit already includes optional regrips.
- Provenance: Preserve the original sheet baseline byte-for-byte in `data/archive/sheet-baseline.json`, archive its history index, and retain each original cost in `sheetCost`. Record the parent URL, full commit SHA, calculation time, and source-file hashes.
- Comparison: 8,560 sheet costs differ from the parent baseline. All 14,899 current app results match the recalculated parent baseline. Rebase existing cost deltas and position changes to zero without changing historical absolute scores or fingertrick traces.
- Example: Row 9102 now uses baseline 11.20 and current 11.20 (+0.00, zero positions gained); original sheet cost 11.60 remains available as provenance.
- UI: Show the pinned parent commit above the metrics and identify the original sheet cost separately in the execution popup. Refresh all baseline hashes and prepared case rankings.
- Remote note: Both local origin and upstream currently point to the personal fork. Parent HEAD was verified directly against `https://github.com/mihlefeld/FTO-Alg-Sorter`; local remote settings were left as found.
- Checks: All 24 tests pass, including archive integrity, unchanged source inputs, provenance, all saved execution totals/ranks, the corrected 0.40 discrepancy, and future snapshot capture. JavaScript syntax checks pass. Browser verification is unavailable without a connected browser.
- Commit(s): Not committed yet.

Historical entries below describe the earlier sheet-based comparison; this recalculation supersedes their baseline and improvement counts.

### 2026-11-07 — Development setup

- Use the existing clone and GitHub fork as the development workspace.
- Rename remotes so `origin` points to the personal fork and `upstream` points to the parent repository.
- Configure plain `git push` to target the personal fork and use the current branch name.
- Create `development` from parent commit `8498326`, which already includes the optional-regrips contribution.
- Add this tracked changelog for experiments and batch review.
- Keep `LOCAL_REPO_GUIDE.md` private through `.git/info/exclude`.
- No algorithm behavior changes in this setup entry. No new commits, pushes, or pull requests were made during setup.

### Experiments awaiting review

### 2026-11-07 — EIF default and one shared move model

- Review: Pending review for contribution to the parent.
- Change: Unprefixed algorithms now use EIF `{U,R}` notation. Removed the dedicated CIF move costs, thumb transitions, regrip costs, and wrist equivalences; all execution uses `CONFIGS.EIF`.
- Mapping: CIF → EIF is `R→R, B→U, L→L, BR→BR, BL→BL, D→B, F→D, U→F`. The omitted `U→F` completes the supplied permutation.
- Example: `{U,F} R B L BR BL D F U` becomes `{B,U} R U L BR BL B D F`. Both now produce identical execution paths and scores, with `{B,U}` rotation cost (currently 1.8), replacing the old free CIF baseline.
- Rotations: Search the 24 distinct EIF views, rebased from the `{U,R}` input frame. Continue accepting all 48 explicit orientation prefixes; CIF prefixes normalize to their equivalent EIF views. Rotation selection now displays the 24 distinct views.
- Wide moves: Retain BL-to-r conversion using only the EIF suffix-remapping table.
- Configuration: Rotation costs now live in `EIF.rotationCosts`; exports contain only EIF. Upload requires the EIF model sections and finite nonnegative costs for all searchable views. Old exports must have their rotation costs moved into EIF and the missing D-on-top values supplied before import; the old CIF move model is no longer used.
- Provisional costs: `{D,BR}`, `{D,F}`, and `{D,BL}` were missing in the old table. They use 1.8 (the existing placeholder rotation rate), with source comments marking them provisional. These values still need ergonomic review.
- Browser checks: No browser is connected to the available UI tool, so interactive upload/download and regrip-menu checks could not be run. Frontend syntax checks pass.
- Checks: All 13 engine/orientation tests pass, including the original regrip regressions, face/suffix conversion, all 48 aliases, all 24 costs, EIF transposition, wide conversion, manual-edit round trips, and invalid orientation/cost handling.
- Dependencies: This changes interpretation of unprefixed input and the configuration schema together; contribute the engine, geometry, model, frontend, and tests as a unit.
- Commit(s): Not committed yet.
- Review notes: Requested as a fork experiment; parent contribution remains pending review.

### 2026-11-07 — Visual algorithm cost history

- Review: Pending review for contribution to the parent.
- Change: Add `visual-changelog.html`, linked from the sorter, with section navigation, case/algorithm search, change filters, saved-revision selection, and live app scoring in a worker.
- Source: Download the FTO Nautilus LL sheet as JSON, preserving all 14,899 algorithms and 377 cases. Its Group column has 36 sections including T0, rather than 35; retain every section in original order. Preserve all 12 columns, row IDs, sheet costs, starting grips, and source provenance.
- Baseline: Original sheet costs are fixed in `data/algorithm-baseline.json`. Display each saved change as an incremental signed two-decimal delta beside the baseline. Also show the absolute selected cost and cumulative delta from the original sheet.
- Detail: Clicking an algorithm opens the selected app execution with finger and thumb states, move costs, regrip costs, repeated-finger penalties, running totals, and orientation cost. The original sheet does not contain a baseline finger path, so none is invented.
- Comparison: Keep the source algorithm, orientation, and starting thumb fixed. Unavailable executions retain an explicit reason and null cost, never zero.
- First snapshot: `eif-default` records all 14,899 app executions. Compared with sheet costs, 8,560 are lower, 6,339 unchanged, none higher, and none unavailable. This captures all sheet-to-current differences; it does not attribute them solely to the EIF change.
- History: Add a command to append immutable snapshots per rule change. Store complete traces per section and load them on demand. Refuse baseline hash mismatches and duplicate snapshot IDs. See `data/README.md` for the workflow.
- Engine: Retain actual regrip/overload costs and thumb transitions in search results, allowing the popup to explain the score without reconstructing or guessing charges. Scoring decisions are unchanged by this instrumentation.
- Checks: All 19 tests pass, including reconciliation of every saved trace and the original engine/orientation regressions. JavaScript syntax and source-row reconciliation checks pass. No browser is connected to the UI tool, so interactive layout/gesture verification is unavailable.
- Commit(s): Not committed yet.

### 2026-11-07 — Collapsible cases and position changes

- Review: Pending review for contribution to the parent.
- Change: Give each of the 377 cases its own collapsible card, including separate #186 and #187 cards. Add Expand all / Collapse all and preserve open states during result updates and revision changes.
- Sorting: Order algorithms within each case by the selected revision's cost, ascending. Equal costs retain source-row order. Cases remain in source order; search and filters do not renumber positions.
- Position changes: Show baseline/current positions and positions gained or lost. Baseline #7 to current #3 displays ↑ 4; unavailable executions sort last and remain unranked.
- JSON: Add `data/case-index.json` for precomputed case groups and baseline order. Add sorted case ID lists and baseline/current rank metadata to existing snapshot JSON without rescoring or changing historical costs. Future captures generate these fields automatically.
- Performance: Read saved orders directly from JSON, evaluate/rank complete live cases in the worker, and build algorithm rows only for open cards. Keep card elements stable during refreshes.
- Checks: All 23 tests pass, including saved ranks across all 14,899 entries, independent #186/#187 grouping, ties, unavailable results, and future snapshot generation. JavaScript syntax checks pass. Browser verification remains unavailable because no browser is connected to the UI tool.
- Baseline: Original baseline file, costs, source-row IDs, and SHA-256 remain unchanged. This is a presentation change, so no new scoring revision was captured.
- Commit(s): Not committed yet.

For each future change, copy this entry and fill it in:

```text
### Short change name
- Review: Pending review
- Change: What now happens, and when.
- Reason: Why this rule or behavior helps.
- Example: Input / previous result / new result.
- Checks: Tests or manual checks actually performed, and their results.
- Dependencies: Related changes required, or none.
- Commit(s): Fill in after committing.
- Review notes: Fill in after review.
```

## Already included in the parent

### 2026-11-04 — Optional regrips merged

Parent merge: `8498326`; implementation: `469bd79`.

- Search optional regrips and return multiple ranked execution paths.
- Allow manual regrip edits through right-click or touch/pen hold.
- Support multiple explicitly requested regrips.
- Add three engine regression tests for ranked alternatives and manual edits.

This is historical context; these changes are already in the parent and do not need to be submitted again.

## Working with the fork and parent

Current branch roles:

| Branch / remote | Purpose |
| --- | --- |
| `development` | Ongoing experiments in this clone. |
| `main` | Local parent baseline; currently tracks `upstream/main`. |
| `optional-regrips` | Preserved earlier contribution branch. |
| `origin` | Personal fork; default push destination. |
| `upstream` | Parent repository; source for synchronization and contributions. |

The new development branch is local until you publish it. After committing changes you want to publish:

```sh
git push -u origin development
```

To incorporate parent updates, first commit your work or otherwise clear the working tree, then:

```sh
git fetch upstream
git switch development
git merge upstream/main
```

To prepare a reviewed batch, first clear the working tree, choose an unused contribution branch name, and create it from the latest parent:

```sh
git fetch upstream
git switch -c contribute/reviewed-rules upstream/main
```

Cherry-pick the approved commits onto that branch, resolve any dependencies, run the relevant checks, and push it to `origin`. Open the pull request against `mihlefeld/FTO-Alg-Sorter:main`. Omit or edit development-only changelog content if it is not useful to the parent.

Existing engine check:

```sh
node --test tests/*.test.mjs
```
