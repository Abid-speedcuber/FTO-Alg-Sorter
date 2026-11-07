import { costBreakdown, formatDelta, deltaFromPrevious, unpackExecution } from './cost-ledger.js';
import { resultToAlgStr } from './engine.js';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const money = value => Number.isFinite(value) ? value.toFixed(2) : '—';
const direction = value => value < -0.005 ? 'lower' : value > 0.005 ? 'higher' : '';
let baseline, history, caseIndex, section, worker, requestId = 0, renderTimer, baselineDigest, liveGlobal, periods;
const ROW_BATCH_SIZE = 250;
let fullRenderToken = 0, fullRenderKey;
let datasetRequest = 0;
const liveScores = new Map();
const liveCaseOrders = new Map();
const openCases = new Map();
const caseNodes = new Map();
let visibleCases = new Map();
const caseKey = number => String(number);
const caseInfos = () => section.full ? caseIndex.sections.flatMap(item => item.cases) : caseIndex.sections.find(item => item.id === section.id).cases;
const entryLookup = new Map();
const state = { revision: 'live', search: '', filter: 'all' };

function errorMessage(message) {
  $('error').hidden = false;
  $('error').textContent = message;
}

function revisionsForView() {
  if (state.revision === 'live') return history.revisions;
  return history.revisions.slice(0, history.revisions.findIndex(revision => revision.id === state.revision) + 1);
}

function selectedResult(entry) {
  if (state.revision === 'live') {
    const result = liveScores.get(entry.id);
    return section.full && result ? { ...result, baselineRank: null, currentRank: null, positionsGained: null, ...liveGlobal?.scores[entry.id] } : result;
  }
  const revision = history.revisions.find(item => item.id === state.revision);
  if (section.full) {
    const summary = revision?.globalData?.scores[entry.id];
    return summary ? { ...summary, execution: revision.scores[entry.id]?.execution } : undefined;
  }
  return revision?.scores[entry.id];
}

function trail(entry) {
  const revisions = revisionsForView();
  let html = `<span title="Active baseline">${money(entry.baseline.cost)}</span>`;
  for (const revision of revisions) {
    const score = section.full ? revision.globalData?.scores[entry.id] : revision.scores[entry.id];
    const delta = score?.deltaFromPrevious;
    html += `<span class="delta ${direction(delta)}" title="${escape(revision.label)} · total ${money(score?.cost)}${score?.reason ? ` · ${escape(score.reason)}` : ''}"><span class="delta-label">${escape(revision.id)}</span>${!score ? '…' : score.status === 'ok' ? formatDelta(delta) : 'n/a'}</span>`;
  }
  if (state.revision === 'live') {
    const score = liveScores.get(entry.id);
    const previous = revisions.length ? (section.full ? revisions.at(-1).globalData?.scores[entry.id]?.cost : revisions.at(-1).scores[entry.id]?.cost) : entry.baseline.cost;
    const delta = score ? deltaFromPrevious(score, previous) : null;
    html += `<span class="delta ${direction(delta)}" title="Live app versus the last saved revision"><span class="delta-label">live</span>${!score ? '…' : score.status === 'ok' ? formatDelta(delta) : 'n/a'}</span>`;
  }
  return html;
}

function rankMovement(result) {
  if (!result) return '<span class="muted">…</span>';
  if (result.currentRank == null) return '<span class="muted">unranked</span>';
  const gained = result.positionsGained;
  const label = gained > 0 ? `↑ ${gained}` : gained < 0 ? `↓ ${Math.abs(gained)}` : '—';
  const description = gained > 0 ? `Gained ${gained} positions` : gained < 0 ? `Lost ${Math.abs(gained)} positions` : 'No position change';
  return `<span class="rank-movement ${gained > 0 ? 'lower' : gained < 0 ? 'higher' : ''}" title="${description}">${label}</span><small class="rank-origin">#${result.baselineRank} → #${result.currentRank}</small>`;
}

function caseRows(rows, bodyOnly = false) {
  const body = rows.map(({ entry, result }) => `<tr>
    <td class="case">${result?.currentRank != null ? `#${result.currentRank}` : result ? '—' : '…'}</td>
    <td><button class="alg-button" data-entry="${escape(entry.id)}">${escape(entry.algorithm)}</button><div class="algorithm-meta">${section.full ? `${escape(entry.caseName)} #${entry.caseNumber} · ` : ''}${escape(entry.baseline.startThumb || 'any grip')} · sheet row ${entry.sourceRow}</div></td>
    <td><div class="cost-trail">${trail(entry)}</div></td>
    <td class="right"><span class="current-cost ${result?.status === 'unavailable' ? 'failure' : ''}" title="${escape(result?.reason || '')}">${!result ? '…' : result.status === 'ok' ? money(result.cost) : 'n/a'}</span><span class="baseline-delta ${direction(result?.deltaFromBaseline)}">${result?.status === 'ok' ? `${formatDelta(result.deltaFromBaseline)} vs baseline` : ''}</span></td>
    <td class="right">${rankMovement(result)}</td>
  </tr>`).join('');
  return bodyOnly ? body : `<div class="table-wrap"><table class="algorithm-table"><thead><tr><th scope="col">Position</th><th scope="col">Algorithm <span class="subtle">/ click to inspect</span></th><th scope="col">Baseline & change history</th><th scope="col" class="right">Current</th><th scope="col" class="right">Position change</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function render() {
  if (!section) return;
  if (section.full) return renderFullDump();
  let lower = 0, higher = 0, same = 0, completed = 0, visibleCount = 0;
  visibleCases = new Map();
  const selectedOrders = state.revision === 'live' ? null
    : history.revisions.find(revision => revision.id === state.revision)?.caseOrders.get(section.id);
  for (const info of caseInfos()) {
    const order = state.revision === 'live' ? liveCaseOrders.get(caseKey(info.caseNumber))
      : selectedOrders?.find(item => item.caseNumber === info.caseNumber)?.entryIds;
    const rows = [];
    for (const id of order || info.entryIds) {
      const entry = entryLookup.get(id);
      const result = selectedResult(entry);
      if (result) completed++;
      if (result?.status === 'ok') {
        if (result.deltaFromBaseline < -0.005) lower++;
        else if (result.deltaFromBaseline > 0.005) higher++;
        else same++;
      }
      const searchText = `${entry.caseName} ${entry.caseGroup} ${entry.caseNumber} ${entry.algorithm} ${entry.referenceAlgorithm}`.toLowerCase();
      if (state.search && !searchText.includes(state.search)) continue;
      if (state.filter === 'changed' && !(result?.status === 'ok' && Math.abs(result.deltaFromBaseline) >= 0.005)) continue;
      if (state.filter === 'lower' && !(result?.status === 'ok' && result.deltaFromBaseline < -0.005)) continue;
      if (state.filter === 'higher' && !(result?.status === 'ok' && result.deltaFromBaseline > 0.005)) continue;
      if (state.filter === 'unavailable' && result?.status !== 'unavailable') continue;
      rows.push({ entry, result });
    }
    visibleCases.set(info.caseNumber, rows);
    visibleCount += rows.length;
    const card = caseNodes.get(info.caseNumber);
    card.hidden = !rows.length;
    const best = rows.find(row => row.result?.status === 'ok')?.result;
    card.querySelector('summary').innerHTML = `<span class="case-chevron" aria-hidden="true">›</span><span class="case-heading-number">#${info.caseNumber}</span><strong>${escape(info.caseName)}</strong><span class="case-card-count">${rows.length === info.entryIds.length ? rows.length : `${rows.length} / ${info.entryIds.length}`} algorithms</span><span class="case-best">${best ? `lowest shown <b>${money(best.cost)}</b>` : rows.every(row => row.result) ? 'no valid execution' : 'evaluating…'}</span>`;
    if (card.open) card.querySelector('.case-body').innerHTML = caseRows(rows);
  }
  $('metric-count').textContent = section.entries.length.toLocaleString();
  $('metric-lower').textContent = lower.toLocaleString();
  $('metric-higher').textContent = higher.toLocaleString();
  $('metric-same').textContent = same.toLocaleString();
  $('progress').textContent = completed < section.entries.length ? `${completed} / ${section.entries.length} evaluated` : `${completed.toLocaleString()} evaluated`;
  $('row-count').textContent = `${visibleCount.toLocaleString()} of ${section.entries.length.toLocaleString()} algorithms`;
  $('empty').hidden = visibleCount > 0;
}

function renderFullDump() {
  const revision = history.revisions.find(item => item.id === state.revision);
  const order = state.revision === 'live' ? liveGlobal?.entryIds : revision?.globalData?.entryIds;
  const ready = !!order && history.revisions.every(item => item.globalData);
  const key = JSON.stringify([datasetRequest, state.revision, state.search, state.filter]);
  if (ready && key === fullRenderKey) return;
  const token = ++fullRenderToken;
  const rows = [];
  let lower = 0, higher = 0, same = 0, completed = 0;
  for (const id of order || caseIndex.global.entryIds) {
    const entry = entryLookup.get(id);
    const result = selectedResult(entry);
    if (result) completed++;
    if (result?.status === 'ok') {
      if (result.deltaFromBaseline < -0.005) lower++;
      else if (result.deltaFromBaseline > 0.005) higher++;
      else same++;
    }
    const text = `${entry.caseName} ${entry.caseGroup} ${entry.caseNumber} ${entry.algorithm} ${entry.referenceAlgorithm}`.toLowerCase();
    if (state.search && !text.includes(state.search)) continue;
    if (state.filter === 'changed' && !(result?.status === 'ok' && Math.abs(result.deltaFromBaseline) >= 0.005)) continue;
    if (state.filter === 'lower' && !(result?.status === 'ok' && result.deltaFromBaseline < -0.005)) continue;
    if (state.filter === 'higher' && !(result?.status === 'ok' && result.deltaFromBaseline > 0.005)) continue;
    if (state.filter === 'unavailable' && result?.status !== 'unavailable') continue;
    rows.push({ entry, result });
  }

  $('metric-count').textContent = section.entries.length.toLocaleString();
  $('metric-lower').textContent = lower.toLocaleString();
  $('metric-higher').textContent = higher.toLocaleString();
  $('metric-same').textContent = same.toLocaleString();
  $('row-count').textContent = `${rows.length.toLocaleString()} of ${section.entries.length.toLocaleString()} algorithms · global positions`;
  $('empty').hidden = rows.length > 0;
  if (!ready) {
    fullRenderKey = undefined;
    $('full-dump').setAttribute('aria-busy', 'true');
    $('full-dump').innerHTML = '<p class="muted">Preparing the complete sorted list…</p>';
    $('row-count').textContent = `0 shown · ${rows.length.toLocaleString()} matching / ${section.entries.length.toLocaleString()} total algorithms`;
    $('progress').textContent = `${completed.toLocaleString()} / ${section.entries.length.toLocaleString()} evaluated · preparing global ranks`;
    return;
  }
  fullRenderKey = key;
  $('full-dump').setAttribute('aria-busy', 'true');
  $('full-dump').innerHTML = caseRows([]);
  const body = $('full-dump').querySelector('tbody');
  let rendered = 0;
  const appendRows = () => {
    if (token !== fullRenderToken || !section.full) return;
    const batch = rows.slice(rendered, rendered + ROW_BATCH_SIZE);
    body.insertAdjacentHTML('beforeend', caseRows(batch, true));
    rendered += batch.length;
    $('row-count').textContent = `${rendered.toLocaleString()} shown · ${rows.length.toLocaleString()} matching / ${section.entries.length.toLocaleString()} total algorithms · global positions`;
    $('progress').textContent = rendered === rows.length ? `${rendered.toLocaleString()} rows displayed · global ranking ready` : `Displaying ${rendered.toLocaleString()} / ${rows.length.toLocaleString()} rows`;
    if (rendered < rows.length) setTimeout(appendRows, 0);
    else $('full-dump').setAttribute('aria-busy', 'false');
  };
  appendRows();
}

function scheduleRender() {
  if (!renderTimer) renderTimer = setTimeout(() => { renderTimer = null; render(); }, section?.full ? 400 : 120);
}

function evaluateSection() {
  worker?.terminate();
  const currentRequest = ++requestId;
  const cases = caseInfos().filter(info => !liveCaseOrders.has(caseKey(info.caseNumber)));
  if (!cases.length && (!section.full || liveGlobal)) return;
  const entries = section.full ? section.entries : cases.flatMap(info => info.entryIds.map(id => entryLookup.get(id)));
  try {
    worker = new Worker(new URL('./cost-ledger-worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', ({ data }) => {
      if (data.requestId !== requestId) return;
      if (data.done) { render(); return; }
      if (data.globalRanking) { liveGlobal = data.globalRanking; render(); return; }
      for (const [id, result] of Object.entries(data.scores)) liveScores.set(id, result);
      liveCaseOrders.set(caseKey(data.ranked.caseNumber), data.ranked.entryIds);
      scheduleRender();
    });
    worker.addEventListener('error', event => {
      errorMessage(`Live calculation failed: ${event.message || 'worker could not load'}. Saved snapshots remain available.`);
    });
    worker.postMessage({ requestId: currentRequest, entries, cases, global: !!section.full, seedScores: section.full ? Object.fromEntries(liveScores) : {} });
  } catch (error) {
    errorMessage(`Live calculation could not start: ${error.message}. Serve this folder over HTTP to load modules.`);
  }
}

function selectSection(id) {
  fullRenderToken++; fullRenderKey = undefined;
  section = id === 'full' ? { id: 'full', label: 'Full algorithm dump', full: true, entries: baseline.sections.flatMap(item => item.entries) } : baseline.sections.find(item => item.id === id) || baseline.sections[0];
  if (!section) throw new Error('The baseline has no sections.');
  const position = baseline.sections.indexOf(section) + 1;
  $('section-title').textContent = section.label;
  $('section-position').textContent = section.full ? 'ALL ALGORITHMS · GLOBAL RANKING' : `SECTION ${String(position).padStart(2, '0')} / ${baseline.sections.length}`;
  $('section-description').textContent = section.full ? `${section.entries.length.toLocaleString()} algorithms · no categories · lowest cost first · global position changes` : `${section.entries.length.toLocaleString()} algorithms · sorted by cost within each case · fixed baseline costs`;
  $('case-controls').hidden = !!section.full;
  $('case-cards').hidden = !!section.full;
  $('full-controls').hidden = !section.full;
  $('full-dump').hidden = !section.full;
  document.querySelectorAll('.section-button').forEach(button => {
    const active = button.dataset.section === section.id;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
  window.history.replaceState(null, '', `#${encodeURIComponent(section.id)}`);
  if (section.full) { render(); loadSavedGlobal(); if (state.revision === 'live') evaluateSection(); return; }
  if (!openCases.has(section.id)) openCases.set(section.id, new Set([caseInfos()[0].caseNumber]));
  caseNodes.clear();
  $('case-cards').replaceChildren();
  for (const info of caseInfos()) {
    const card = document.createElement('details');
    card.className = 'case-card';
    card.dataset.case = info.caseNumber;
    card.open = openCases.get(section.id).has(info.caseNumber);
    card.innerHTML = '<summary></summary><div class="case-body"></div>';
    caseNodes.set(info.caseNumber, card);
    $('case-cards').append(card);
  }
  render();
  loadSavedSection(section);
  if (state.revision === 'live') evaluateSection();
}

async function showExecution(id) {
  const entry = section.entries.find(item => item.id === id);
  let result = selectedResult(entry);
  if (result?.status === 'ok' && !result.execution && state.revision !== 'live') {
    try { await loadSavedSection(baseline.sections.find(item => item.entries.some(candidate => candidate.id === id))); result = selectedResult(entry); }
    catch (error) { errorMessage(error.message); return; }
  }
  const revisionLabel = state.revision === 'live' ? 'Live app' : history.revisions.find(item => item.id === state.revision)?.label;
  $('dialog-title').textContent = `${entry.caseName || entry.caseNumber} · execution costs`;
  $('dialog-revision').textContent = `${revisionLabel} · sheet row ${entry.sourceRow} · baseline ${money(entry.baseline.cost)}${entry.sheetCost ? ` · original sheet ${money(entry.sheetCost.cost)}` : ''}`;
  if (!result || result.status !== 'ok') {
    $('dialog-content').innerHTML = `<p class="dialog-alg">${escape(entry.algorithm)}</p><p class="failure">${escape(result?.reason || 'This algorithm is still being evaluated. Close this popup and try again in a moment.')}</p>`;
  } else {
    const execution = unpackExecution(result.execution);
    const costs = costBreakdown(execution);
    const startingRegripCost = execution.startingRegripCost ?? 0;
    let running = execution.rotCost + startingRegripCost;
    const rows = execution.fingertricks.map((move, index) => {
      const subtotal = move.cost + move.regripCost + move.overloadCost;
      running += subtotal;
      return `<tr><td>${index + 1}</td><td class="move-chip">${escape(move.token)}</td><td>${escape(move.finger || '(unspecified)')}</td><td>${escape(move.thumb)} → ${escape(move.thumbAfter)}${move.regrip ? `<br><span class="regrip-text">regrip ${escape(move.thumbBefore)} → ${escape(move.thumb)}</span>` : ''}</td><td class="numeric">${money(move.cost)}</td><td class="numeric ${move.regripCost ? 'regrip-text' : ''}">${money(move.regripCost)}</td><td class="numeric ${move.overloadCost ? 'overload-text' : ''}">${money(move.overloadCost)}</td><td class="numeric">${money(subtotal)}</td><td class="numeric">${money(running)}</td></tr>`;
    }).join('');
    const totals = [['Orientation', costs.orientation], ['Starting regrip', costs.startingRegrip], ['Moves', costs.moves], ['Regrips', costs.regrips], ['Repeated finger', costs.overload], ['Total', costs.total]];
    const source = `${baseline.source.url.split('#')[0]}#gid=${baseline.source.gid}&range=F${entry.sourceRow}:H${entry.sourceRow}`;
    $('dialog-content').innerHTML = `<p class="muted">Sheet algorithm · starting thumb ${escape(entry.baseline.startThumb || 'any')}</p><p class="dialog-alg">${escape(entry.algorithm)}</p>${resultToAlgStr(execution) !== entry.algorithm ? `<p class="muted">Executed as</p><p class="dialog-alg">${escape(resultToAlgStr(execution))}</p>` : ''}<div class="totals">${totals.map(([label, value]) => `<div class="total-item"><span>${label}</span><strong>${money(value)}</strong></div>`).join('')}</div><p class="muted">${execution.rot} starts at ${escape(execution.startThumb)}. Running total starts with orientation ${money(execution.rotCost)} + starting regrip ${money(startingRegripCost)}. Total change from baseline: <span class="${direction(result.deltaFromBaseline)}">${formatDelta(result.deltaFromBaseline)}</span>.</p><div class="table-wrap"><table class="breakdown"><thead><tr><th>#</th><th>Move</th><th>Finger</th><th>Thumb before → after</th><th class="numeric">Move cost</th><th class="numeric">Regrip</th><th class="numeric">Repeat</th><th class="numeric">Step total</th><th class="numeric">Running</th></tr></thead><tbody><tr><td>—</td><td colspan="3">Initial orientation ${escape(execution.rot)}</td><td class="numeric">—</td><td class="numeric">—</td><td class="numeric">—</td><td class="numeric">${money(execution.rotCost)}</td><td class="numeric">${money(execution.rotCost)}</td></tr><tr><td>—</td><td colspan="3">Starting regrip · ${escape(execution.startThumb)}</td><td class="numeric">—</td><td class="numeric">—</td><td class="numeric">—</td><td class="numeric">${money(startingRegripCost)}</td><td class="numeric">${money(execution.rotCost + startingRegripCost)}</td></tr>${rows}</tbody></table></div><p class="dialog-note">Baseline costs come from the system captured for this comparison period. This is the ${escape(revisionLabel)} execution. <a href="${escape(source)}" target="_blank" rel="noreferrer">View source row ↗</a></p>`;
  }
  $('execution-dialog').showModal();
}

async function loadJSON(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const raw = await response.text();
  const parsed = JSON.parse(raw);
  if (url.endsWith('algorithm-baseline.json') && globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    Object.defineProperty(parsed, '_downloadSha256', { value: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') });
  }
  return parsed;
}

async function loadSavedSection(selectedSection) {
  try {
    await Promise.all(history.revisions.map(async revision => {
      if (revision.loadedSections.has(selectedSection.id)) return;
      const file = revision.sectionFiles[selectedSection.id];
      if (!file) throw new Error(`No ${selectedSection.id} snapshot for ${revision.label}`);
      const saved = await loadJSON(file);
      if (saved.revisionId !== revision.id || saved.sectionId !== selectedSection.id) throw new Error(`Snapshot identity mismatch: ${file}`);
      Object.assign(revision.scores, saved.scores);
      revision.caseOrders.set(selectedSection.id, saved.cases);
      revision.loadedSections.add(selectedSection.id);
    }));
    if (section.id === selectedSection.id || section.full) render();
  } catch (error) { errorMessage(`Saved history could not load: ${error.message}`); }
}

async function loadSavedGlobal() {
  try {
    await Promise.all(history.revisions.map(async revision => {
      if (revision.globalData) return;
      if (!revision.globalFile) throw new Error(`Global index missing for ${revision.label}. Run node scripts/prepare-case-rankings.mjs.`);
      revision.globalData = await loadJSON(revision.globalFile);
    }));
    if (section.full) render();
  } catch (error) { errorMessage(error.message); }
}

async function loadDataset(periodId = 'current') {
  fullRenderToken++; fullRenderKey = undefined;
  const loadId = ++datasetRequest;
  worker?.terminate();
  requestId++;
  const period = periods.periods.find(item => item.id === periodId);
  const urls = period || { baseline: './data/algorithm-baseline.json', history: './data/cost-history.json', caseIndex: './data/case-index.json' };
  baselineDigest = undefined;
  const loaded = await Promise.all([loadJSON(urls.baseline), loadJSON(urls.history), loadJSON(urls.caseIndex)]);
  if (loadId !== datasetRequest) return;
  [baseline, history, caseIndex] = loaded;
  baselineDigest = baseline._downloadSha256;
  $('baseline-download').href = urls.baseline;
  $('history-download').href = urls.history;
  if (!baseline.sections?.length || !Array.isArray(history.revisions)) throw new Error('Invalid baseline or history JSON structure.');
  if (baselineDigest && baselineDigest !== history.baselineSha256) throw new Error('Baseline hash mismatch. Restore the matching dataset.');
  if (caseIndex.baselineSha256 !== history.baselineSha256) throw new Error('Case index belongs to a different baseline.');
  liveScores.clear(); liveCaseOrders.clear(); openCases.clear(); entryLookup.clear(); liveGlobal = undefined;
  for (const section of baseline.sections) for (const entry of section.entries) entryLookup.set(entry.id, entry);
  for (const revision of history.revisions) { revision.scores = {}; revision.loadedSections = new Set(); revision.caseOrders = new Map(); }
  state.revision = period ? history.revisions.at(-1)?.id || 'live' : 'live';
  const definition = baseline.baselineDefinition;
  if (definition?.kind === 'working-tree-checkpoint') {
    $('baseline-reference').textContent = `Baseline: ${definition.label} · ${definition.calculatedAt}`;
  } else if (definition?.commit) {
    $('baseline-reference').innerHTML = `Baseline: <a href="${escape(definition.repository)}/commit/${escape(definition.commit)}" target="_blank" rel="noreferrer">parent commit ${escape(definition.commit.slice(0, 7))} ↗</a> · recalculated for every algorithm`;
  }
  $('source-link').href = baseline.source.url;
  $('section-count').textContent = baseline.sections.length;
  $('sections').innerHTML = `<button class="section-button" data-section="full"><span class="section-number">∞</span><span class="section-name">Full alg dump</span><span class="section-size">${entryLookup.size.toLocaleString()}</span></button>` + baseline.sections.map((item, i) => `<button class="section-button" data-section="${escape(item.id)}"><span class="section-number">${String(i + 1).padStart(2, '0')}</span><span class="section-name">${escape(item.label)}</span><span class="section-size">${item.entries.length.toLocaleString()}</span></button>`).join('');
  $('revision').replaceChildren(new Option(period ? 'Live app vs this old baseline' : 'Live app', 'live'));
  for (const revision of history.revisions) $('revision').append(new Option(revision.label, revision.id));
  $('revision').value = state.revision;
  $('error').hidden = true;
  selectSection(decodeURIComponent(location.hash.slice(1)));
}

async function init() {
  try {
    periods = await loadJSON('./data/baseline-epochs.json');
    for (const period of periods.periods) $('baseline-period').append(new Option(period.label, period.id));
    await loadDataset();
    $('sections').addEventListener('click', event => {
      const button = event.target.closest('[data-section]');
      if (button) selectSection(button.dataset.section);
    });
    $('case-cards').addEventListener('click', event => {
      const button = event.target.closest('[data-entry]');
      if (button) showExecution(button.dataset.entry);
    });
    $('full-dump').addEventListener('click', event => { const button = event.target.closest('[data-entry]'); if (button) showExecution(button.dataset.entry); });
    $('baseline-period').addEventListener('change', async event => { try { await loadDataset(event.target.value); } catch (error) { errorMessage(error.message); } });
    $('case-cards').addEventListener('toggle', event => {
      const card = event.target;
      if (!card.matches('.case-card') || !card.isConnected || section.full) return;
      const number = Number(card.dataset.case);
      const opened = openCases.get(section.id);
      if (!opened) return;
      if (card.open) {
        opened.add(number);
        card.querySelector('.case-body').innerHTML = caseRows(visibleCases.get(number) || []);
      } else {
        opened.delete(number);
        card.querySelector('.case-body').replaceChildren();
      }
    }, true);
    for (const action of ['expand', 'collapse']) $(action + '-cases').addEventListener('click', () => {
      for (const [number, card] of caseNodes) {
        if (card.hidden) continue;
        card.open = action === 'expand';
        if (card.open) openCases.get(section.id).add(number);
        else openCases.get(section.id).delete(number);
      }
    });
    $('search').addEventListener('input', event => { state.search = event.target.value.toLowerCase().trim(); render(); });
    $('filter').addEventListener('change', event => { state.filter = event.target.value; render(); });
    $('revision').addEventListener('change', event => {
      state.revision = event.target.value;
      if (state.revision === 'live') evaluateSection();
      else worker?.terminate();
      render();
    });
  } catch (error) {
    $('section-title').textContent = 'Baseline could not load';
    errorMessage(`${error.message}. Run python3 -m http.server 8000 from this folder, then open http://localhost:8000/visual-changelog.html.`);
  }
}
$('close-dialog').addEventListener('click', () => $('execution-dialog').close());
$('execution-dialog').addEventListener('click', event => {
  const bounds = $('execution-dialog').getBoundingClientRect();
  if (event.target === $('execution-dialog') &&
      (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) $('execution-dialog').close();
});
init();
