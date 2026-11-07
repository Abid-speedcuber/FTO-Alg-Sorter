import { costBreakdown, formatDelta, deltaFromPrevious, unpackExecution } from './cost-ledger.js';
import { resultToAlgStr } from './engine.js';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const money = value => Number.isFinite(value) ? value.toFixed(2) : '—';
const direction = value => value < -0.005 ? 'lower' : value > 0.005 ? 'higher' : '';
let baseline, history, caseIndex, section, worker, requestId = 0, renderTimer, baselineDigest;
const liveScores = new Map();
const liveCaseOrders = new Map();
const openCases = new Map();
const caseNodes = new Map();
let visibleCases = new Map();
const caseKey = number => `${section.id}:${number}`;
const caseInfos = () => caseIndex.sections.find(item => item.id === section.id).cases;
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
  return state.revision === 'live' ? liveScores.get(entry.id)
    : history.revisions.find(revision => revision.id === state.revision)?.scores[entry.id];
}

function trail(entry) {
  const revisions = revisionsForView();
  let html = `<span title="Original sheet cost">${money(entry.baseline.cost)}</span>`;
  for (const revision of revisions) {
    const score = revision.scores[entry.id];
    const delta = score?.deltaFromPrevious;
    html += `<span class="delta ${direction(delta)}" title="${escape(revision.label)} · total ${money(score?.cost)}${score?.reason ? ` · ${escape(score.reason)}` : ''}"><span class="delta-label">${escape(revision.id)}</span>${!score ? '…' : score.status === 'ok' ? formatDelta(delta) : 'n/a'}</span>`;
  }
  if (state.revision === 'live') {
    const score = liveScores.get(entry.id);
    const previous = revisions.length ? revisions.at(-1).scores[entry.id]?.cost : entry.baseline.cost;
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

function caseRows(rows) {
  return `<div class="table-wrap"><table class="algorithm-table"><thead><tr><th scope="col">Position</th><th scope="col">Algorithm <span class="subtle">/ click to inspect</span></th><th scope="col">Baseline & change history</th><th scope="col" class="right">Current</th><th scope="col" class="right">Position change</th></tr></thead><tbody>${rows.map(({ entry, result }) => `<tr>
    <td class="case">${result?.currentRank != null ? `#${result.currentRank}` : result ? '—' : '…'}</td>
    <td><button class="alg-button" data-entry="${escape(entry.id)}">${escape(entry.algorithm)}</button><div class="algorithm-meta">${escape(entry.baseline.startThumb || 'any grip')} · sheet row ${entry.sourceRow}</div></td>
    <td><div class="cost-trail">${trail(entry)}</div></td>
    <td class="right"><span class="current-cost ${result?.status === 'unavailable' ? 'failure' : ''}" title="${escape(result?.reason || '')}">${!result ? '…' : result.status === 'ok' ? money(result.cost) : 'n/a'}</span><span class="baseline-delta ${direction(result?.deltaFromBaseline)}">${result?.status === 'ok' ? `${formatDelta(result.deltaFromBaseline)} vs baseline` : ''}</span></td>
    <td class="right">${rankMovement(result)}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

function render() {
  if (!section) return;
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

function scheduleRender() {
  if (!renderTimer) renderTimer = setTimeout(() => { renderTimer = null; render(); }, 120);
}

function evaluateSection() {
  worker?.terminate();
  const cases = caseInfos().filter(info => !liveCaseOrders.has(caseKey(info.caseNumber)));
  if (!cases.length) return;
  const entries = cases.flatMap(info => info.entryIds.map(id => entryLookup.get(id)));
  const currentRequest = ++requestId;
  try {
    worker = new Worker(new URL('./cost-ledger-worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', ({ data }) => {
      if (data.requestId !== requestId) return;
      if (data.done) { render(); return; }
      for (const [id, result] of Object.entries(data.scores)) liveScores.set(id, result);
      liveCaseOrders.set(caseKey(data.ranked.caseNumber), data.ranked.entryIds);
      scheduleRender();
    });
    worker.addEventListener('error', event => {
      errorMessage(`Live calculation failed: ${event.message || 'worker could not load'}. Saved snapshots remain available.`);
    });
    worker.postMessage({ requestId: currentRequest, entries, cases });
  } catch (error) {
    errorMessage(`Live calculation could not start: ${error.message}. Serve this folder over HTTP to load modules.`);
  }
}

function selectSection(id) {
  section = baseline.sections.find(item => item.id === id) || baseline.sections[0];
  if (!section) throw new Error('The baseline has no sections.');
  const position = baseline.sections.indexOf(section) + 1;
  $('section-title').textContent = section.label;
  $('section-position').textContent = `SECTION ${String(position).padStart(2, '0')} / ${baseline.sections.length}`;
  $('section-description').textContent = `${section.entries.length.toLocaleString()} algorithms · sorted by cost within each case · fixed baseline costs`;
  document.querySelectorAll('.section-button').forEach(button => {
    const active = button.dataset.section === section.id;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
  window.history.replaceState(null, '', `#${encodeURIComponent(section.id)}`);
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

function showExecution(id) {
  const entry = section.entries.find(item => item.id === id);
  const result = selectedResult(entry);
  const revisionLabel = state.revision === 'live' ? 'Live app' : history.revisions.find(item => item.id === state.revision)?.label;
  $('dialog-title').textContent = `${entry.caseName || entry.caseNumber} · execution costs`;
  $('dialog-revision').textContent = `${revisionLabel} · sheet row ${entry.sourceRow} · baseline ${money(entry.baseline.cost)}`;
  if (!result || result.status !== 'ok') {
    $('dialog-content').innerHTML = `<p class="dialog-alg">${escape(entry.algorithm)}</p><p class="failure">${escape(result?.reason || 'This algorithm is still being evaluated. Close this popup and try again in a moment.')}</p>`;
  } else {
    const execution = unpackExecution(result.execution);
    const costs = costBreakdown(execution);
    let running = execution.rotCost;
    const rows = execution.fingertricks.map((move, index) => {
      const subtotal = move.cost + move.regripCost + move.overloadCost;
      running += subtotal;
      return `<tr><td>${index + 1}</td><td class="move-chip">${escape(move.token)}</td><td>${escape(move.finger || '(unspecified)')}</td><td>${escape(move.thumb)} → ${escape(move.thumbAfter)}${move.regrip ? `<br><span class="regrip-text">regrip ${escape(move.thumbBefore)} → ${escape(move.thumb)}</span>` : ''}</td><td class="numeric">${money(move.cost)}</td><td class="numeric ${move.regripCost ? 'regrip-text' : ''}">${money(move.regripCost)}</td><td class="numeric ${move.overloadCost ? 'overload-text' : ''}">${money(move.overloadCost)}</td><td class="numeric">${money(subtotal)}</td><td class="numeric">${money(running)}</td></tr>`;
    }).join('');
    const totals = [['Orientation', costs.orientation], ['Moves', costs.moves], ['Regrips', costs.regrips], ['Repeated finger', costs.overload], ['Total', costs.total]];
    const source = `${baseline.source.url.split('#')[0]}#gid=${baseline.source.gid}&range=F${entry.sourceRow}:H${entry.sourceRow}`;
    $('dialog-content').innerHTML = `<p class="muted">Sheet algorithm · starting thumb ${escape(entry.baseline.startThumb || 'any')}</p><p class="dialog-alg">${escape(entry.algorithm)}</p>${resultToAlgStr(execution) !== entry.algorithm ? `<p class="muted">Executed as</p><p class="dialog-alg">${escape(resultToAlgStr(execution))}</p>` : ''}<div class="totals">${totals.map(([label, value]) => `<div class="total-item"><span>${label}</span><strong>${money(value)}</strong></div>`).join('')}</div><p class="muted">${execution.rot} starts at ${escape(execution.startThumb)}. Running total starts with the ${money(execution.rotCost)} orientation cost. Total change from baseline: <span class="${direction(result.deltaFromBaseline)}">${formatDelta(result.deltaFromBaseline)}</span>.</p><div class="table-wrap"><table class="breakdown"><thead><tr><th>#</th><th>Move</th><th>Finger</th><th>Thumb before → after</th><th class="numeric">Move cost</th><th class="numeric">Regrip</th><th class="numeric">Repeat</th><th class="numeric">Step total</th><th class="numeric">Running</th></tr></thead><tbody><tr><td>—</td><td colspan="3">Initial orientation ${escape(execution.rot)}</td><td class="numeric">—</td><td class="numeric">—</td><td class="numeric">—</td><td class="numeric">${money(execution.rotCost)}</td><td class="numeric">${money(execution.rotCost)}</td></tr>${rows}</tbody></table></div><p class="dialog-note">The baseline sheet stores totals, not original finger paths. This is the ${escape(revisionLabel)} execution. <a href="${escape(source)}" target="_blank" rel="noreferrer">View source row ↗</a></p>`;
  }
  $('execution-dialog').showModal();
}

async function loadJSON(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const raw = await response.text();
  if (url.endsWith('algorithm-baseline.json') && globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    baselineDigest = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return JSON.parse(raw);
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
    if (section.id === selectedSection.id) render();
  } catch (error) { errorMessage(`Saved history could not load: ${error.message}`); }
}

async function init() {
  try {
    [baseline, history, caseIndex] = await Promise.all([loadJSON('./data/algorithm-baseline.json'), loadJSON('./data/cost-history.json'), loadJSON('./data/case-index.json')]);
    if (!baseline.sections?.length || !Array.isArray(history.revisions)) throw new Error('Invalid baseline or history JSON structure.');
    if (baselineDigest && baselineDigest !== history.baselineSha256) throw new Error('The baseline has changed since history was recorded. Restore the original baseline JSON.');
    if (caseIndex.baselineSha256 !== history.baselineSha256) throw new Error('Case index belongs to a different baseline.');
    for (const section of baseline.sections) for (const entry of section.entries) entryLookup.set(entry.id, entry);
    for (const revision of history.revisions) { revision.scores = {}; revision.loadedSections = new Set(); revision.caseOrders = new Map(); }
    $('source-link').href = baseline.source.url;
    $('section-count').textContent = baseline.sections.length;
    $('sections').innerHTML = baseline.sections.map((item, i) => `<button class="section-button" data-section="${escape(item.id)}"><span class="section-number">${String(i + 1).padStart(2, '0')}</span><span class="section-name">${escape(item.label)}</span><span class="section-size">${item.entries.length.toLocaleString()}</span></button>`).join('');
    for (const revision of history.revisions) {
      const option = document.createElement('option');
      option.value = revision.id;
      option.textContent = revision.label;
      $('revision').append(option);
    }
    $('sections').addEventListener('click', event => {
      const button = event.target.closest('[data-section]');
      if (button) selectSection(button.dataset.section);
    });
    $('case-cards').addEventListener('click', event => {
      const button = event.target.closest('[data-entry]');
      if (button) showExecution(button.dataset.entry);
    });
    $('case-cards').addEventListener('toggle', event => {
      const card = event.target;
      if (!card.matches('.case-card') || !card.isConnected) return;
      const number = Number(card.dataset.case);
      const opened = openCases.get(section.id);
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
    selectSection(decodeURIComponent(location.hash.slice(1)));
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
