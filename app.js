import {
  todayKey,
  loadRoot, saveRoot,
  listAccounts, createAccount, setSelected,
  getGoal, setGoal, addEntry, undoLast, resetToday, todayTotal, historyTotals
} from './storage.js';

let root = loadRoot();

const els = {
  installBtn: document.getElementById('installBtn'),
  accountSelect: document.getElementById('accountSelect'),
  addAccountBtn: document.getElementById('addAccountBtn'),

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
};

// --- Account UI ---
function refreshAccounts() {
  const opts = listAccounts(root);
  els.accountSelect.innerHTML = opts.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
  // ensure selected attribute matches root
  els.accountSelect.value = opts.find(o => o.id === (root.selected || o.id))?.id || opts[0]?.id;
}
els.accountSelect.addEventListener('change', () => {
  setSelected(root, els.accountSelect.value);
  refresh();  // redraw UI for selected account
});
els.addAccountBtn.addEventListener('click', () => {
  const name = prompt('New account name:', 'Work');
  if (!name) return;
  createAccount(root, name.trim());
  refreshAccounts();
  refresh();
});

// --- Goal ---
els.goalInput.value = getGoal(root);
els.saveGoalBtn.addEventListener('click', () => {
  const g = Number(els.goalInput.value);
  if (!Number.isFinite(g) || g <= 0) {
    toast('Enter a positive number for goal.');
    return;
  }
  setGoal(root, g);
  toast(`Goal updated: ${getGoal(root)} ml`);
  refresh();
});

// --- Quick add / custom / undo / reset ---
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
  const removed = undoLast(root);
  toast(removed ? `Removed −${removed} ml` : 'Nothing to undo');
  refresh();
});
els.resetBtn.addEventListener('click', () => {
  if (!confirm('Clear today’s entries for this account?')) return;
  resetToday(root);
  refresh();
});

function addAmount(ml) {
  if (ml <= 0) return;
  addEntry(root, ml);
  refresh();
  const tot = todayTotal(root);
  if (tot >= getGoal(root)) toast('Hydration goal reached! 🎉');
}

// --- UI refresh ---
function refresh() {
  refreshAccounts();

  els.goalInput.value = getGoal(root);

  const total = todayTotal(root);
  els.todayTotal.textContent = `${total} ml`;
  const pct = Math.max(0, Math.min(100, (total / Math.max(1, getGoal(root))) * 100));
  els.progressBar.style.width = `${pct}%`;

  const k = todayKey();
  // Build entries list from current state (we don’t expose read directly, but it’s rendered via historyTotals/todayTotal)
  // We’ll reconstruct from history for today only:
  // For entries list, we need timestamps; simplest: read from storage directly:
  // Re-load quickly to get raw data (safe: loadRoot() gives same object structure)
  const raw = loadRoot(); // fresh read
  const st = raw.accounts[raw.selected].data;
  const entries = (st.days[k]?.entries || []).slice().reverse();
  els.entriesList.innerHTML = entries.map(e => `<li><span>${e.ts}</span><span>+${e.ml} ml</span></li>`).join('');

  // history list + chart
  const hist = historyTotals(root, 14);
  els.historyList.innerHTML = hist.map(([d,t]) => `<li><span>${d}</span><span>${t} ml</span></li>`).join('');
  drawChart(els.historyChart, hist, getGoal(root));
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

// PWA install prompt (unchanged)
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  els.installBtn.hidden = false;
});
els.installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  els.installBtn.hidden = true;
});

// Initial render + rollover check
refresh();
setInterval(() => { root = loadRoot(); refresh(); }, 60_000);

