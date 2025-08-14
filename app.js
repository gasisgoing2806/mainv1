// ===================== app.js (ES module) =====================
import {
  ready, todayKey,
  loadRoot, saveRoot,
  listAccounts, createAccount, setSelected,
  getGoal, setGoal, addEntry, undoLast, resetToday, todayTotal, historyTotals
} from './storage.js';

let root = null;

const els = {
  installBtn: document.getElementById('installBtn'),
  accountSelect: document.getElementById('accountSelect'),
  addAccountBtn: document.getElementById('addAccountBtn'),

  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importFile: document.getElementById('importFile'),

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

// Bootstrap after storage is ready
(async function bootstrap() {
  await ready();
  root = loadRoot();

  // --- Accounts ---
  function refreshAccounts() {
    const opts = listAccounts(root);
    els.accountSelect.innerHTML = opts.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
    const sel = opts.find(o => o.id === root.selected)?.id || opts[0]?.id;
    if (sel) els.accountSelect.value = sel;
  }
  els.accountSelect?.addEventListener('change', () => {
    setSelected(root, els.accountSelect.value);
    refresh();
  });
  els.addAccountBtn?.addEventListener('click', () => {
    const name = prompt('New account name:', 'Work');
    if (!name) return;
    createAccount(root, name.trim());
    refresh();
  });

  // --- Goal ---
  els.goalInput.value = getGoal(root);
  els.saveGoalBtn.addEventListener('click', () => {
    const g = Number(els.goalInput.value);
    if (!Number.isFinite(g) || g <= 0) return toast('Enter a positive number for goal.');
    setGoal(root, g);
    toast(`Goal updated: ${getGoal(root)} ml`);
    refresh();
  });

  // --- Add / Undo / Reset ---
  document.querySelectorAll('.chip[data-amt]').forEach((btn) => {
    btn.addEventListener('click', () => addAmount(Number(btn.dataset.amt)));
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

  // --- Export / Import ---
  els.exportBtn?.addEventListener('click', () => {
    try {
      const data = loadRoot();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
      a.href = url; a.download = `water-tracker-backup-${ts}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast('Exported backup JSON ✅');
    } catch (e) {
      console.error(e); toast('Export failed');
    }
  });

  els.importBtn?.addEventListener('click', () => els.importFile.click());
  els.importFile?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!isValidRoot(parsed)) { toast('Invalid backup file'); e.target.value=''; return; }
      if (!confirm('Import will replace your current local data (all accounts). Continue?')) {
        e.target.value=''; return;
      }
      normalizeRoot(parsed);
      saveRoot(parsed);
      root = loadRoot();
      refresh();
      toast('Import complete ✅');
    } catch (err) {
      console.error(err); toast('Import failed');
    } finally {
      e.target.value = '';
    }
  });
  function isValidRoot(obj) { return obj && typeof obj === 'object' && obj.accounts && typeof obj.accounts === 'object'; }
  function normalizeRoot(obj) {
    obj.accounts ||= {};
    if (!obj.selected) obj.selected = Object.keys(obj.accounts)[0] || null;
    for (const id of Object.keys(obj.accounts)) {
      const acc = obj.accounts[id] || {};
      acc.name ||= 'Account';
      acc.data ||= { goal_ml: 2000, days: {} };
      acc.data.goal_ml ||= 2000;
      acc.data.days ||= {};
      acc.data.days[todayKey()] ||= { entries: [] };
      obj.accounts[id] = acc;
    }
    if (!obj.selected) {
      const id = Object.keys(obj.accounts)[0] || 'personal';
      obj.selected = id;
    }
  }

  // --- UI refresh ---
  function refresh() {
    root = loadRoot(); // fresh copy from memory
    refreshAccounts();
    els.goalInput.value = getGoal(root);

    const total = todayTotal(root);
    els.todayTotal.textContent = `${total} ml`;
    const pct = Math.max(0, Math.min(100, (total / Math.max(1, getGoal(root))) * 100));
    els.progressBar.style.width = `${pct}%`;

    const k = todayKey();
    const st = root.accounts[root.selected].data;
    const entries = (st.days[k]?.entries || []).slice().reverse();
    els.entriesList.innerHTML = entries.map(e => `<li><span>${e.ts}</span><span>+${e.ml} ml</span></li>`).join('');

    const hist = historyTotals(root, 14);
    els.historyList.innerHTML = hist.map(([d,t]) => `<li><span>${d}</span><span>${t} ml</span></li>`).join('');
    drawChart(els.historyChart, hist, getGoal(root));
  }

  function drawChart(canvas, data, goal) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);

    const padding = 28, barGap = 8;
    const count = data.length;
    const barWidth = (w - padding*2 - barGap*(count-1)) / count;

    const axisColor = 'rgba(31, 41, 55, 0.35)';
    const goalColor = '#ec4899';
    const dateLabel = '#6b7280';
    const barTop = '#db2777';
    const barBottom = '#f472b6';

    const maxVal = Math.max(goal, ...data.map(d => d[1]), 1);
    const toY = (val) => h - padding - (val / maxVal) * (h - padding*2);

    // axes
    ctx.strokeStyle = axisColor; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padding, padding); ctx.lineTo(padding, h - padding); ctx.lineTo(w - padding, h - padding); ctx.stroke();

    // goal line + label
    const gy = toY(goal);
    ctx.strokeStyle = goalColor; ctx.setLineDash([6,4]);
    ctx.beginPath(); ctx.moveTo(padding, gy); ctx.lineTo(w - padding, gy); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = goalColor; ctx.fillText(`Goal ${goal} ml`, w - padding - 110, gy - 6);

    // bars
    let x = padding;
    data.forEach(([date, val]) => {
      const y = toY(val);
      const barH = h - padding - y;
      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      grad.addColorStop(0, barTop); grad.addColorStop(1, barBottom);
      ctx.fillStyle = grad; ctx.fillRect(x, y, barWidth, barH);

      ctx.fillStyle = dateLabel;
      const mmdd = date.slice(5);
      ctx.fillText(mmdd, x + barWidth/2 - 12, h - padding + 14);
      x += barWidth + barGap;
    });
  }

  // Toast
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

  // PWA install prompt
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    els.installBtn && (els.installBtn.hidden = false);
  });
  els.installBtn?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    els.installBtn.hidden = true;
  });

  // Initial render + day rollover
  refresh();
  setInterval(() => refresh(), 60_000);

  // SW register (if not already)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
  }
})();
