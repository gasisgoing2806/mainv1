
import { todayKey, loadState, saveState, addEntry, undoLast, todayTotal, historyTotals } from './storage.js';

let state = loadState();
const els = {
  todayTotal: document.getElementById('todayTotal'),
  progressBar: document.getElementById('progressBar'),
  goalInput: document.getElementById('goalInput'),
  saveGoalBtn: document.getElementById('saveGoalBtn'),
  entriesList: document.getElementById('entriesList'),
  resetBtn: document.getElementById('resetBtn'),
  undoBtn: document.getElementById('undoBtn'),
  customAmt: document.getElementById('customAmt'),
  addCustomBtn: document.getElementById('addCustomBtn'),
  historyList: document.getElementById('historyList'),
  historyChart: document.getElementById('historyChart'),
  installBtn: document.getElementById('installBtn'),
};

// Initialize goal input
els.goalInput.value = state.goal_ml;

// Quick-add buttons
document.querySelectorAll('.chip[data-amt]').forEach((btn) => {
  btn.addEventListener('click', () => {
    addAmount(Number(btn.dataset.amt));
  });
});

els.addCustomBtn.addEventListener('click', () => {
  const v = Number(els.customAmt.value || 0);
  if (v > 0) addAmount(v);
  els.customAmt.value = '';
});
els.customAmt.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const v = Number(els.customAmt.value || 0);
    if (v > 0) addAmount(v);
    els.customAmt.value = '';
  }
});

els.undoBtn.addEventListener('click', () => {
  const removed = undoLast(state);
  toast(removed ? `Removed −${removed} ml` : 'Nothing to undo');
  refresh();
});

els.saveGoalBtn.addEventListener('click', () => {
  const g = Number(els.goalInput.value);
  if (!Number.isFinite(g) || g <= 0) {
    toast('Enter a positive number for goal.');
    return;
  }
  state.goal_ml = Math.round(g);
  saveState(state);
  toast(`Goal updated: ${state.goal_ml} ml`);
  refresh();
});

els.resetBtn.addEventListener('click', () => {
  if (!confirm('Clear today’s entries?')) return;
  state.days[todayKey()] = { entries: [] };
  saveState(state);
  refresh();
});

function addAmount(ml) {
  if (ml <= 0) return;
  addEntry(state, ml);
  refresh();
  const tot = todayTotal(state);
  if (tot >= state.goal_ml) toast('Hydration goal reached! 🎉');
}

// UI refresh
function refresh() {
  // ensure today bucket exists
  state.days[todayKey()] ??= { entries: [] };
  saveState(state);

  const total = todayTotal(state);
  els.todayTotal.textContent = `${total} ml`;
  const pct = Math.max(0, Math.min(100, (total / Math.max(1, state.goal_ml)) * 100));
  els.progressBar.style.width = `${pct}%`;

  // entries list (newest first)
  const entries = state.days[todayKey()].entries.slice().reverse();
  els.entriesList.innerHTML = entries.map(e => `<li><span>${e.ts}</span><span>+${e.ml} ml</span></li>`).join('');

  // history list + chart
  const hist = historyTotals(state, 14);
  els.historyList.innerHTML = hist.map(([d,t]) => `<li><span>${d}</span><span>${t} ml</span></li>`).join('');
  drawChart(els.historyChart, hist, state.goal_ml);
}

function drawChart(canvas, data, goal) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0,0,w,h);

  const padding = 28;
  const barGap = 8;
  const count = data.length;
  const barWidth = (w - padding*2 - barGap*(count-1)) / count;

  const maxVal = Math.max(goal, ...data.map(d => d[1]), 1);
  const toY = (val) => h - padding - (val / maxVal) * (h - padding*2);

  // axes
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, h - padding);
  ctx.lineTo(w - padding, h - padding);
  ctx.stroke();

  // goal line
  const gy = toY(goal);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
  ctx.setLineDash([6,4]);
  ctx.beginPath();
  ctx.moveTo(padding, gy);
  ctx.lineTo(w - padding, gy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
  ctx.fillText(`Goal ${goal} ml`, w - padding - 100, gy - 6);

  // bars
  let x = padding;
  data.forEach(([date, val], i) => {
    const y = toY(val);
    const barH = h - padding - y;
    // gradient
    const grad = ctx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, '#0ea5e9');
    grad.addColorStop(1, '#22d3ee');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barWidth, barH);

    // label (MM-DD)
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const mmdd = date.slice(5);
    ctx.fillText(mmdd, x + barWidth/2 - 12, h - padding + 14);

    x += barWidth + barGap;
  });
}

// Tiny toast
let toastEl;
function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    Object.assign(toastEl.style, {
      position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.7)', color: 'white', padding: '10px 14px', borderRadius: '10px',
      zIndex: 9999, fontSize: '14px'
    });
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.style.opacity = '1';
  setTimeout(() => { toastEl.style.opacity = '0'; }, 1800);
}

// PWA: install prompt
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  els.installBtn.hidden = false;
});
els.installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  els.installBtn.hidden = true;
});

// Service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}

// Initial paint
refresh();

// New day roll-over check every minute
setInterval(() => {
  // If todayKey changed, refresh to create new bucket
  state = loadState();
  refresh();
}, 60_000);
