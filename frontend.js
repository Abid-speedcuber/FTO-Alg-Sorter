import { parse_alg, explore_alg, resultToAlgStr, CONFIGS, ROTATIONMAPPING, getCorrectNotationFromRotation } from './engine.js';

function normalizeFinger(f) {
  if (!f) return { base: 'none', left: false };
  const lower = f.toLowerCase();
  const bases = ['thumb', 'index', 'middle', 'ring', 'wrist'];
  for (const base of bases) {
    if (lower === base) return { base, left: false };
    if (lower === base + 'l') return { base, left: true };
  }
  return { base: 'none', left: false };
}

const HAND_COLOR = {
  left: 'var(--h-left)',
  right: 'var(--h-right)',
};

const THUMB_COLOR = {
  front: 'var(--t-front)',
  top: 'var(--t-top)',
  'back+': 'var(--t-backplus)',
  'back-': 'var(--t-backminus)',
  bottom: 'var(--t-bottom)'
};

const THUMB_LABEL = { front: 'Front', top: 'Top', 'back+': 'Back+', 'back-': 'Back-', bottom: 'Bottom' };

function fingerLabel(base, left) {
  if (base === 'none') return '—';
  const name = base.charAt(0).toUpperCase() + base.slice(1);
  return left ? `${name} (L)` : name;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function renderLegend() {
  const fingerItems = ['left', 'right']
  .map((hand) => `<span class="legend-item"><span class="dot" style="background:${HAND_COLOR[hand]}"></span>${fingerLabel(hand, false)}</span>`)
  .join('');
  const thumbItems = Object.keys(THUMB_COLOR)
  .map((thumb) => `<span class="legend-item"><span class="dot" style="background:${THUMB_COLOR[thumb]}"></span>${THUMB_LABEL[thumb]}</span>`)
  .join('');
  return `
      <div class="legend">
        <div class="legend-group"><span class="legend-title">Hand</span>${fingerItems}</div>
        <div class="legend-group"><span class="legend-title">Thumb</span>${thumbItems}</div>
      </div>`;
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}


const optionExecutions = new WeakMap();
let renderedExecutions = [];

function renderOptionBlock(result, index, showHeader, entry) {
  const executionId = renderedExecutions.push({ result, index, showHeader, entry }) - 1;
  const startThumb = result.fingertricks.length > 0 ? result.fingertricks[0].thumb : null;
  const algStr = resultToAlgStr(result);
  let html = `<div class="option-block" data-execution="${executionId}">`;
  if (showHeader) {
    html += `
        <div class="option-head">
          <span class="option-index">Option ${index + 1}</span>
          <span class="option-cost">${result.cost.toFixed(2)}</span>
          <button class="copy-btn option-copy-btn" type="button" data-alg="${escapeHtml(algStr)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
            <span class="copy-btn-label">Copy</span>
          </button>
        </div>`;
  }
  if (startThumb) {
    html += `<div class="start-line">${result.rot} (${result.rotCost}) · thumb at <span style="color:${THUMB_COLOR[startThumb] || 'var(--text-muted)'}">${THUMB_LABEL[startThumb] || startThumb}</span></div>`;
  }
  html += '<div class="move-list">';
  for (const [moveIndex, move] of result.fingertricks.entries()) {
    const { base, left } = normalizeFinger(move.finger);
    var leftColor = HAND_COLOR['right'];
    if (left) {
      leftColor = HAND_COLOR['left'];
    }
    const thumbColor = THUMB_COLOR[move.thumb] || 'var(--text-muted)';
    const thumbLabel = THUMB_LABEL[move.thumb] || move.thumb || '?';
    html += `
        <div class="move${move.regrip ? ' regrip' : ''}" data-move="${moveIndex}" title="Right-click or hold to change regrip">
          <span class="move-thumb" style="background:${thumbColor}">${thumbLabel}</span>
          <span class="move-thumb" style="background:${leftColor}">${capitalizeFirstLetter(base)}</span>
          <span class="move-token">${escapeHtml(move.token)}</span>
          ${move.regrip ? '<span class="move-regrip-tag">regrip</span>' : ''}
        </div>`;
  }
  html += '</div></div>';
  return html;
}

function bindOptionExecutions(root, configs) {
  root.querySelectorAll('.option-block').forEach(block => {
    optionExecutions.set(block, { ...renderedExecutions[block.dataset.execution], configs });
  });
  renderedExecutions = [];
}

function showRegripMenu(move, clientX, clientY) {
  document.querySelector('.regrip-menu')?.remove();
  const block = move.closest('.option-block');
  const { result, index, showHeader, entry, configs } = optionExecutions.get(block);
  const moveIndex = Number(move.dataset.move);
  const config = configs[getCorrectNotationFromRotation(result.rot)];
  const menu = document.createElement('div');
  menu.className = 'regrip-menu';
  menu.setAttribute('role', 'menu');
  const label = document.createElement('div');
  label.textContent = `Regrip before ${result.fingertricks[moveIndex].token}`;
  menu.append(label);
  const currentThumb = moveIndex === 0 ? result.startThumb :
    result.fingertricks[moveIndex - 1].finger === 'wrist'
      ? config.transitions[result.fingertricks[moveIndex - 1].thumb][result.fingertricks[moveIndex - 1].token]
      : result.fingertricks[moveIndex - 1].thumb;
  const choices = moveIndex === 0 ? [] : Object.keys(config.regripCosts[currentThumb] || {});
  for (const target of [...choices, 'none']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.textContent = target === 'none' ? 'Remove regrip' : `Thumb to ${THUMB_LABEL[target]}`;
    button.disabled = moveIndex === 0 || (target === 'none' && !result.fingertricks[moveIndex].regrip);
    button.addEventListener('click', () => {
      const regrips = Object.fromEntries(result.fingertricks.slice(1).map((m, i) => [i + 1, m.regrip ? m.thumb : 'none']));
      regrips[moveIndex] = target;
      const updated = explore_alg({ tokens: result.fingertricks.map(m => m.token), rot: result.rot, auf: result.auf }, configs, {}, {
        limit: 1, startThumb: result.startThumb, regrips
      })[0];
      if (!updated) {
        label.textContent = 'No valid path with this regrip';
        return;
      }
      // Edit this option in place without rerunning the automatic ranking.
      const holder = document.createElement('div');
      holder.innerHTML = renderOptionBlock(updated, index, showHeader, entry);
      bindOptionExecutions(holder, configs);
      const replacement = holder.firstElementChild;
      replacement.querySelector('.option-copy-btn')?.addEventListener('click', e => copyExecution(e.currentTarget.dataset.alg, e.currentTarget));
      entry.results[index] = updated;
      if (index === 0) {
        entry.best = updated;
        const card = block.closest('.card');
        const alg = resultToAlgStr(updated);
        card.dataset.alg = alg;
        card.querySelector('.alg-text').textContent = alg;
        card.querySelector('.cost-num').textContent = updated.cost.toFixed(2);
        card.querySelector('.summary-copy-btn').dataset.alg = alg;
      }
      block.replaceWith(replacement);
      menu.remove();
    });
    menu.append(button);
  }
  document.body.append(menu);
  menu.style.left = `${Math.max(0, Math.min(clientX, window.innerWidth - menu.offsetWidth))}px`;
  menu.style.top = `${Math.max(0, Math.min(clientY, window.innerHeight - menu.offsetHeight))}px`;
  menu.querySelector('button:not(:disabled)')?.focus();
}

function setupRegripGestures(resultsSection) {
  let timer, press, heldMove;
  const cancelHold = () => { clearTimeout(timer); press = null; };
  resultsSection.addEventListener('contextmenu', event => {
    const move = event.target.closest('.move');
    if (!move) return;
    if (press || event.pointerType === 'touch') heldMove = move;
    cancelHold();
    event.preventDefault();
    showRegripMenu(move, event.clientX, event.clientY);
  });
  document.addEventListener('pointerdown', event => {
    cancelHold();
    heldMove = null;
    if (!event.isPrimary || !['touch', 'pen'].includes(event.pointerType)) return;
    const move = event.target.closest('.move');
    if (!move || !resultsSection.contains(move)) return;
    press = { x: event.clientX, y: event.clientY };
    timer = setTimeout(() => {
      heldMove = move;
      showRegripMenu(move, press.x, press.y);
      press = null;
    }, 500);
  });
  document.addEventListener('pointermove', event => {
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) cancelHold();
  });
  document.addEventListener('pointerup', cancelHold);
  document.addEventListener('pointercancel', () => { cancelHold(); heldMove = null; });
  document.addEventListener('scroll', cancelHold, true);
  // Releasing a long press can generate a click; keep that click from closing the menu.
  document.addEventListener('click', event => {
    if (heldMove?.contains(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    heldMove = null;
  }, true);
}

document.addEventListener('click', event => {
  if (!event.target.closest('.regrip-menu')) document.querySelector('.regrip-menu')?.remove();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') document.querySelector('.regrip-menu')?.remove();
});
document.addEventListener('scroll', () => document.querySelector('.regrip-menu')?.remove(), true);

function costColor(cost, min, max) {
  if (max === min) return 'var(--primary)';
  const t = Math.max(0, Math.min(1, (cost - min) / (max - min)));
  const good = [94, 234, 212];
  const bad = [251, 113, 133];
  const rgb = good.map((value, index) => Math.round(value + (bad[index] - value) * t));
  return `rgb(${rgb.join(',')})`;
}

let uploadedConfigs = null;

function updateConfigStatus(message) {
  const statusLabel = document.getElementById('configStatus');
  if (statusLabel) {
    statusLabel.textContent = message;
  }
}

function getActiveConfigs() {
  return uploadedConfigs || CONFIGS;
}

function getActiveRotationMapping() {
  const container = document.getElementById('rotationToggles');
  if (!container) return ROTATIONMAPPING;
  const checked = Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((box) => box.value);
  if (checked.length === 0) return {};
  const filtered = {};
  for (const key of checked) {
    if (key in ROTATIONMAPPING) filtered[key] = ROTATIONMAPPING[key];
  }
  return filtered;
}

function renderRotationToggles() {
  const container = document.getElementById('rotationToggles');
  if (!container) return;
  const keys = Object.keys(ROTATIONMAPPING);
  container.innerHTML = keys.map((key) => `
    <label class="rotation-toggle">
      <input type="checkbox" value="${escapeHtml(key)}" checked>
      <span>${escapeHtml(key)}</span>
    </label>`).join('');

  const allBtn = document.getElementById('rotationsAll');
  const noneBtn = document.getElementById('rotationsNone');
  const setAll = (state) => {
    container.querySelectorAll('input[type="checkbox"]').forEach((box) => { box.checked = state; });
  };
  if (allBtn) allBtn.addEventListener('click', () => setAll(true));
  if (noneBtn) noneBtn.addEventListener('click', () => setAll(false));
}


function downloadConfigs() {
  const payload = JSON.stringify(CONFIGS, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'configs.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function uploadConfigs(file) {
  const reader = new FileReader();
  
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || typeof parsed !== 'object' || !parsed.CIF || !parsed.EIF) {
        throw new Error('The selected JSON must contain CIF and EIF entries.');
      }
      uploadedConfigs = parsed;
      updateConfigStatus('Using uploaded CONFIGS');
    } catch (error) {
      uploadedConfigs = null;
      updateConfigStatus('Invalid CONFIGS JSON');
    }
  };
  
  reader.onerror = () => {
    uploadedConfigs = null;
    updateConfigStatus('Failed to read CONFIGS JSON');
  };
  
  reader.readAsText(file);
}

function analyze() {
  const raw = document.getElementById('algs').value;
  const lines = raw.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  const resultsSection = document.getElementById('results');
  
  const numOptionsInput = document.getElementById('numOptions');
  let numOptions = parseInt(numOptionsInput.value, 10);
  if (!Number.isFinite(numOptions) || numOptions < 1) numOptions = 1;
  if (numOptions > 100) numOptions = 100;
  numOptionsInput.value = numOptions;
  
  if (lines.length === 0) {
    resultsSection.innerHTML = '<div class="empty">Paste one or more algorithms above, then hit Analyze.</div>';
    return;
  }
  
  const entries = lines.map((line) => {
    const tokenized = parse_alg(line);
    const configs = getActiveConfigs();
    let results = [];
    try {
      results = explore_alg(tokenized, configs, getActiveRotationMapping(), { limit: numOptions });
    } catch (error) {
      results = [];
    }
    const best = results.length > 0 ? results[0] : null;
    return { alg: line, best, results };
  });
  
  entries.sort((left, right) => {
    const leftCost = left.best ? left.best.cost : Infinity;
    const rightCost = right.best ? right.best.cost : Infinity;
    return leftCost - rightCost;
  });
  
  const validCosts = entries.filter((entry) => entry.best).map((entry) => entry.best.cost);
  const min = validCosts.length ? Math.min(...validCosts) : 0;
  const max = validCosts.length ? Math.max(...validCosts) : 1;
  
  let html = `
      <div class="results-head">
        <h2>Results · ${entries.length} alg${entries.length > 1 ? 's' : ''}</h2>
        <button id="copyResults" class="copy-btn" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
          <span class="copy-btn-label">Copy top executions</span>
        </button>
      </div>`;
  html += renderLegend();
  
  entries.forEach((entry, index) => {
    const { alg, best, results } = entry;
    if (!best) {
      html += `
          <details class="card">
            <summary>
              <span class="rank">${index + 1}</span>
              <span class="alg-text invalid">${escapeHtml(alg)}</span>
              <span class="thumb-chip">no valid path</span>
            </summary>
            <div class="card-body"><div class="start-line">No fingertrick path found within the regrip limit.</div></div>
          </details>`;
      return;
    }
    
    const startThumb = best.fingertricks.length > 0 ? best.fingertricks[0].thumb : null;
    const pct = max === min ? 100 : Math.round(((best.cost - min) / (max - min)) * 100);
    const barColor = costColor(best.cost, min, max);
    const algStr = resultToAlgStr(best);
    html += `
        <details class="card" data-alg="${escapeHtml(algStr)}">
          <summary>
            <span class="rank selectable" title="Click to select">${index + 1}</span>
            <span class="alg-text">${escapeHtml(algStr)}</span>
            <span class="meta">
              ${startThumb ? `<span class="thumb-chip">start: ${THUMB_LABEL[startThumb] || startThumb}</span>` : ''}
              <span class="cost-wrap">
                <span class="cost-bar-track"><span class="cost-bar-fill" style="width:${pct}%;background:${barColor}"></span></span>
                <span class="cost-num" style="color:${barColor}">${best.cost.toFixed(2)}</span>
              </span>
              <button class="copy-btn option-copy-btn summary-copy-btn" type="button" data-alg="${escapeHtml(algStr)}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
                <span class="copy-btn-label">Copy</span>
              </button>
            </span>
            <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 6l6 6-6 6"/></svg>
          </summary>
          <div class="card-body">${results.slice(0, numOptions).map((result, optionIndex) => renderOptionBlock(result, optionIndex, numOptions > 1, entry)).join('')}</div>
        </details>`;
  });
  
  resultsSection.innerHTML = html;
  bindOptionExecutions(resultsSection, getActiveConfigs());
  
  const copyBtn = document.getElementById('copyResults');
  const copyBtnLabel = copyBtn ? copyBtn.querySelector('.copy-btn-label') : null;
  const updateCopyBtnLabel = () => {
    if (!copyBtnLabel) return;
    const count = resultsSection.querySelectorAll('.card.selected').length;
    copyBtnLabel.textContent = count > 0 ? `Copy selected (${count})` : 'Copy top executions';
  };
  if (copyBtn) {
    copyBtn.addEventListener('click', () => copyTopExecutions(resultsSection, entries, copyBtn, updateCopyBtnLabel));
  }

  resultsSection.querySelectorAll('.rank.selectable').forEach((rank) => {
    rank.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const card = rank.closest('.card');
      if (card) {
        card.classList.toggle('selected');
        updateCopyBtnLabel();
      }
    });
  });

  resultsSection.querySelectorAll('.option-copy-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      copyExecution(button.dataset.alg || '', button);
    });
  });
}

function makeButtonFeedback(btn) {
  const label = btn.querySelector('.copy-btn-label');
  const originalLabel = label ? label.textContent : '';
  return (message, ok) => {
    if (!label) return;
    label.textContent = message;
    btn.classList.toggle('copied', ok);
    setTimeout(() => {
      label.textContent = originalLabel;
      btn.classList.remove('copied');
    }, 1500);
  };
}

function writeToClipboard(text, showState) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
    .then(() => showState('Copied!', true))
    .catch(() => showState('Copy failed', false));
    return;
  }
  
  const helper = document.createElement('textarea');
  helper.value = text;
  helper.style.position = 'fixed';
  helper.style.opacity = '0';
  document.body.appendChild(helper);
  helper.select();
  try {
    document.execCommand('copy');
    showState('Copied!', true);
  } catch (error) {
    showState('Copy failed', false);
  }
  document.body.removeChild(helper);
}

function copyExecution(text, btn) {
  const showState = makeButtonFeedback(btn);
  if (!text) {
    showState('Nothing to copy', false);
    return;
  }
  writeToClipboard(text, showState);
}

function copyTopExecutions(resultsSection, entries, btn, onDone) {
  const selectedCards = resultsSection ? resultsSection.querySelectorAll('.card.selected') : [];
  let text;
  let emptyMsg;
  if (selectedCards.length > 0) {
    text = Array.from(selectedCards).map((card) => card.dataset.alg || '').filter(Boolean).join('\n');
    emptyMsg = 'No valid selection';
  } else {
    text = entries.filter((entry) => entry.best).map((entry) => resultToAlgStr(entry.best)).join('\n');
    emptyMsg = 'No valid executions';
  }
  const baseShow = makeButtonFeedback(btn);
  const showState = (message, ok) => {
    baseShow(message, ok);
    if (onDone) setTimeout(onDone, 1600);
  };
  if (!text) {
    showState(emptyMsg, false);
    return;
  }
  writeToClipboard(text, showState);
}

function init() {
  setupRegripGestures(document.getElementById('results'));
  const analyzeButton = document.getElementById('analyze');
  const algInput = document.getElementById('algs');
  const downloadButton = document.getElementById('downloadConfig');
  const uploadButton = document.getElementById('uploadConfigButton');
  const uploadInput = document.getElementById('uploadConfig');
  
  if (analyzeButton) {
    analyzeButton.addEventListener('click', analyze);
  }
  
  if (algInput) {
    algInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        analyze();
      }
    });
  }
  
  if (downloadButton) {
    downloadButton.addEventListener('click', downloadConfigs);
  }
  
  if (uploadButton && uploadInput) {
    uploadButton.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', (event) => {
      const [file] = event.target.files || [];
      if (file) {
        uploadConfigs(file);
      }
      event.target.value = '';
    });
  }
  
  updateConfigStatus('Using built-in CONFIGS');
  renderRotationToggles();
}

document.addEventListener('DOMContentLoaded', init);
