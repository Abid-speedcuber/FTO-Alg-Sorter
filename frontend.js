(function (global) {
  const engine = global.FTOAlgSorterEngine;

  if (!engine) {
    throw new Error('FTOAlgSorterEngine is not loaded.');
  }

  const { parse_alg, getCorrectNotationFromRotation, explore_alg, resultToAlgStr } = engine;

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

  const FINGER_COLOR = {
    thumb: 'var(--f-thumb)',
    index: 'var(--f-index)',
    middle: 'var(--f-middle)',
    ring: 'var(--f-ring)',
    wrist: 'var(--f-wrist)',
    none: 'var(--f-none)'
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
    const fingerItems = ['thumb', 'index', 'middle', 'ring', 'wrist', 'none']
      .map((finger) => `<span class="legend-item"><span class="dot" style="background:${FINGER_COLOR[finger]}"></span>${fingerLabel(finger, false)}</span>`)
      .join('');
    const thumbItems = Object.keys(THUMB_COLOR)
      .map((thumb) => `<span class="legend-item"><span class="dot" style="background:${THUMB_COLOR[thumb]}"></span>${THUMB_LABEL[thumb]}</span>`)
      .join('');
    return `
      <div class="legend">
        <div class="legend-group"><span class="legend-title">Finger</span>${fingerItems}</div>
        <div class="legend-group"><span class="legend-title">Thumb position</span>${thumbItems}</div>
      </div>`;
  }

  function renderOptionBlock(result, index, showHeader) {
    const startThumb = result.fingertricks.length > 0 ? result.fingertricks[0].thumb : null;
    let html = '<div class="option-block">';
    if (showHeader) {
      html += `
        <div class="option-head">
          <span class="option-index">Option ${index + 1}</span>
          <span class="option-cost">${result.cost.toFixed(2)}</span>
        </div>`;
    }
    if (startThumb) {
      html += `<div class="start-line">Start · thumb at <span style="color:${THUMB_COLOR[startThumb] || 'var(--text-muted)'}">${THUMB_LABEL[startThumb] || startThumb}</span></div>`;
    }
    html += '<div class="move-list">';
    for (const move of result.fingertricks) {
      const { base, left } = normalizeFinger(move.finger);
      const color = FINGER_COLOR[base] || FINGER_COLOR.none;
      const thumbColor = THUMB_COLOR[move.thumb] || 'var(--text-muted)';
      const thumbLabel = THUMB_LABEL[move.thumb] || move.thumb || '?';
      html += `
        <div class="move${move.regrip ? ' regrip' : ''}">
          <span class="move-thumb" style="background:${thumbColor}">${thumbLabel}</span>
          <span class="move-token" style="color:${color}">${escapeHtml(move.token)}</span>
          ${move.regrip ? '<span class="move-regrip-tag">regrip</span>' : ''}
        </div>`;
    }
    html += '</div></div>';
    return html;
  }

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
    return uploadedConfigs || engine.CONFIGS;
  }

  function getConfigForNotation(notation) {
    const configs = getActiveConfigs();
    return configs && configs[notation] ? configs[notation] : engine.CONFIGS[notation];
  }

  function downloadConfigs() {
    const payload = JSON.stringify(engine.CONFIGS, null, 2);
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
    if (numOptions > 4) numOptions = 4;
    numOptionsInput.value = numOptions;

    if (lines.length === 0) {
      resultsSection.innerHTML = '<div class="empty">Paste one or more algorithms above, then hit Analyze.</div>';
      return;
    }

    const entries = lines.map((line) => {
      const tokenized = parse_alg(line);
      const notation = getCorrectNotationFromRotation(tokenized.rot);
      const config = getConfigForNotation(notation);
      let results = [];
      try {
        results = explore_alg(tokenized, config);
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
        <details class="card">
          <summary>
            <span class="rank">${index + 1}</span>
            <span class="alg-text">${escapeHtml(algStr)}</span>
            <span class="meta">
              ${startThumb ? `<span class="thumb-chip">start: ${THUMB_LABEL[startThumb] || startThumb}</span>` : ''}
              <span class="cost-wrap">
                <span class="cost-bar-track"><span class="cost-bar-fill" style="width:${pct}%;background:${barColor}"></span></span>
                <span class="cost-num" style="color:${barColor}">${best.cost.toFixed(2)}</span>
              </span>
            </span>
            <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 6l6 6-6 6"/></svg>
          </summary>
          <div class="card-body">${results.slice(0, numOptions).map((result, optionIndex) => renderOptionBlock(result, optionIndex, numOptions > 1)).join('')}</div>
        </details>`;
    });

    resultsSection.innerHTML = html;

    const copyBtn = document.getElementById('copyResults');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => copyTopExecutions(entries, copyBtn));
    }
  }

  function copyTopExecutions(entries, btn) {
    const lines = entries.filter((entry) => entry.best).map((entry) => resultToAlgStr(entry.best));
    const text = lines.join('\n');
    const label = btn.querySelector('.copy-btn-label');
    const originalLabel = label ? label.textContent : '';

    const showState = (message, ok) => {
      if (!label) return;
      label.textContent = message;
      btn.classList.toggle('copied', ok);
      setTimeout(() => {
        label.textContent = originalLabel;
        btn.classList.remove('copied');
      }, 1500);
    };

    if (!text) {
      showState('No valid executions', false);
      return;
    }

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

  function init() {
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
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
