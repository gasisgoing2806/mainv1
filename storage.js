// Multi-account local storage with migration from legacy single-account.
// Root format:
// {
//   selected: "personal-id",
//   accounts: {
//     "personal-id": { name: "Personal", data: { goal_ml, days{...} } },
//     "work-id":     { name: "Work",     data: {...} }
//   }
// }

const ROOT_KEY = "waterTrackerRoot_v1";
const LEGACY_KEY = "waterTracker";

// --- date helpers ---
function todayKey() {
  const d = new Date();
  return d.toISOString().slice(0,10);
}

function newEmptyState() {
  return { goal_ml: 2000, days: { [todayKey()]: { entries: [] } } };
}

// --- root load/save & migration ---
function loadRoot() {
  // Try new root first
  try {
    const raw = localStorage.getItem(ROOT_KEY);
    if (raw) {
      const root = JSON.parse(raw);
      // guards
      root.selected ||= Object.keys(root.accounts || {})[0];
      root.accounts ||= {};
      if (!root.selected) {
        // no accounts? create default
        const id = genId("personal");
        root.selected = id;
        root.accounts[id] = { name: "Personal", data: newEmptyState() };
        saveRoot(root);
      } else {
        // ensure today bucket exists for selected
        const st = getCurrentState(root);
        st.days ||= {};
        st.goal_ml ||= 2000;
        st.days[todayKey()] ||= { entries: [] };
        saveRoot(root);
      }
      return root;
    }
  } catch (e) {
    console.warn("Corrupted root; resetting", e);
  }

  // Migrate legacy single-account if present
  const legacyRaw = localStorage.getItem(LEGACY_KEY);
  let initialData = newEmptyState();
  if (legacyRaw) {
    try {
      const obj = JSON.parse(legacyRaw);
      obj.days ||= {};
      obj.goal_ml ||= 2000;
      obj.days[todayKey()] ||= { entries: [] };
      initialData = obj;
    } catch {}
  }

  const id = genId("personal");
  const root = {
    selected: id,
    accounts: { [id]: { name: "Personal", data: initialData } },
  };
  saveRoot(root);
  return root;
}

function saveRoot(root) {
  localStorage.setItem(ROOT_KEY, JSON.stringify(root));
}

function genId(prefix="acc") {
  return `${prefix}-${Math.random().toString(36).slice(2,8)}`;
}

// --- account ops ---
function listAccounts(root) {
  return Object.entries(root.accounts || {}).map(([id, v]) => ({ id, name: v.name }));
}

function createAccount(root, name) {
  const id = genId(name.toLowerCase().replace(/\\s+/g, ''));
  root.accounts[id] = { name: name || "Account", data: newEmptyState() };
  root.selected = id;
  saveRoot(root);
  return id;
}

function setSelected(root, id) {
  if (root.accounts[id]) {
    root.selected = id;
    // ensure today's bucket
    const st = getCurrentState(root);
    st.days ||= {};
    st.goal_ml ||= 2000;
    st.days[todayKey()] ||= { entries: [] };
    saveRoot(root);
  }
}

function getCurrentState(root) {
  const acc = root.accounts[root.selected];
  if (!acc) {
    // should not happen; create default
    const id = createAccount(root, "Personal");
    return root.accounts[id].data;
  }
  return acc.data;
}

// --- per-account data ops ---
function addEntry(root, ml) {
  const st = getCurrentState(root);
  const k = todayKey();
  st.days[k] ||= { entries: [] };
  const now = new Date();
  st.days[k].entries.push({ ml: Number(ml), ts: now.toTimeString().slice(0,5) });
  saveRoot(root);
}

function undoLast(root) {
  const st = getCurrentState(root);
  const k = todayKey();
  const entries = st.days[k]?.entries || [];
  const last = entries.pop();
  saveRoot(root);
  return last?.ml ?? 0;
}

function resetToday(root) {
  const st = getCurrentState(root);
  st.days[todayKey()] = { entries: [] };
  saveRoot(root);
}

function getGoal(root) {
  return getCurrentState(root).goal_ml || 2000;
}

function setGoal(root, g) {
  const st = getCurrentState(root);
  st.goal_ml = Math.max(1, Math.round(Number(g)));
  saveRoot(root);
}

function todayTotal(root) {
  const st = getCurrentState(root);
  const k = todayKey();
  const entries = st.days[k]?.entries || [];
  return entries.reduce((a, e) => a + Number(e.ml || 0), 0);
}

function historyTotals(root, days = 14) {
  const st = getCurrentState(root);
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0,10);
    const total = (st.days[key]?.entries || []).reduce((a, e) => a + Number(e.ml || 0), 0);
    out.push([key, total]);
  }
  return out;
}

export {
  todayKey,
  loadRoot, saveRoot,
  listAccounts, createAccount, setSelected,
  getGoal, setGoal, addEntry, undoLast, resetToday, todayTotal, historyTotals
};
