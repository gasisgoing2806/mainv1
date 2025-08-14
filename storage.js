// ===================== storage.js — IndexedDB =====================
// Multi-account root structure (unchanged API):
// {
//   selected: "<account-id>",
//   accounts: {
//     "<account-id>": { name: "Personal", data: { goal_ml, days{...} } },
//     ...
//   }
// }

const DB_NAME = 'waterTrackerDB';
const DB_VERSION = 1;
const STORE = 'root';
const KEY = 'singleton';

// Legacy keys (for migration and fallback)
const ROOT_KEY = 'waterTrackerRoot_v1';
const LEGACY_KEY = 'waterTracker';

// ---------- date helpers ----------
function todayKey() {
  const d = new Date();
  return d.toISOString().slice(0,10);
}
function newEmptyState() {
  return { goal_ml: 2000, days: { [todayKey()]: { entries: [] } } };
}

// ---------- IndexedDB helpers ----------
let dbPromise = null;
let memRoot = null;         // in-memory current root
let useLocalFallback = false;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  }).catch(err => {
    console.warn('[storage] IndexedDB unavailable, falling back to localStorage.', err);
    useLocalFallback = true;
    return null;
  });
  return dbPromise;
}

async function idbGet() {
  if (useLocalFallback) {
    const raw = localStorage.getItem(ROOT_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const st = tx.objectStore(STORE);
    const req = st.get(KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(value) {
  if (useLocalFallback) {
    localStorage.setItem(ROOT_KEY, JSON.stringify(value));
    return;
  }
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    const req = st.put(value, KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------- migration from legacy localStorage ----------
function migrateFromLegacyLocalStorage() {
  // Prefer multi-account root if present
  const rawRoot = localStorage.getItem(ROOT_KEY);
  if (rawRoot) {
    try {
      const parsed = JSON.parse(rawRoot);
      normalizeRoot(parsed);
      return parsed;
    } catch {}
  }
  // Otherwise migrate single-account data if present
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
  const id = genId('personal');
  const root = { selected: id, accounts: { [id]: { name: 'Personal', data: initialData } } };
  normalizeRoot(root);
  // Save migrated structure into ROOT_KEY as well (fallback path)
  try { localStorage.setItem(ROOT_KEY, JSON.stringify(root)); } catch {}
  return root;
}

// ---------- initialization ----------
let readyPromise = null;

function normalizeRoot(obj) {
  obj.accounts ||= {};
  if (!obj.selected) obj.selected = Object.keys(obj.accounts)[0] || null;
  // Ensure each account has required shape
  for (const id of Object.keys(obj.accounts)) {
    const acc = obj.accounts[id] || {};
    acc.name ||= 'Account';
    acc.data ||= { goal_ml: 2000, days: {} };
    acc.data.goal_ml ||= 2000;
    acc.data.days ||= {};
    acc.data.days[todayKey()] ||= { entries: [] };
    obj.accounts[id] = acc;
  }
  // If no accounts at all, create one
  if (!obj.selected) {
    const id = genId('personal');
    obj.selected = id;
    obj.accounts[id] = { name: 'Personal', data: newEmptyState() };
  }
}

function deepClone(o) {
  return (typeof structuredClone === 'function') ? structuredClone(o) : JSON.parse(JSON.stringify(o));
}

function genId(prefix='acc') {
  return `${prefix}-${Math.random().toString(36).slice(2,8)}`;
}

export function ready() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    // Try load from IndexedDB
    let loaded = null;
    try { loaded = await idbGet(); } catch (e) { console.warn('[storage] idbGet failed', e); }
    if (!loaded) {
      // Migrate from localStorage or start fresh, then seed DB
      loaded = migrateFromLegacyLocalStorage();
      try { await idbPut(loaded); } catch (e) { console.warn('[storage] idbPut seed failed', e); }
    }
    normalizeRoot(loaded);
    memRoot = loaded;
  })();
  return readyPromise;
}

// ---------- public API (same names as before) ----------
export function loadRoot() {
  // return a clone so callers can't mutate memRoot without saveRoot
  return deepClone(memRoot);
}

let saveTimer = null;
export function saveRoot(root) {
  normalizeRoot(root);
  memRoot = root;
  // debounce writes a bit
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { idbPut(memRoot).catch(e => console.warn('[storage] save failed', e)); }, 120);
}

export function listAccounts(root) {
  return Object.entries(root.accounts || {}).map(([id, v]) => ({ id, name: v.name }));
}

export function createAccount(root, name) {
  const id = genId(name ? name.toLowerCase().replace(/\s+/g,'') : 'acc');
  root.accounts[id] = { name: name || 'Account', data: newEmptyState() };
  root.selected = id;
  saveRoot(root);
  return id;
}

export function setSelected(root, id) {
  if (root.accounts[id]) {
    root.selected = id;
    const st = root.accounts[id].data;
    st.days ||= {};
    st.goal_ml ||= 2000;
    st.days[todayKey()] ||= { entries: [] };
    saveRoot(root);
  }
}

export function getGoal(root) {
  const acc = root.accounts[root.selected];
  return acc?.data?.goal_ml || 2000;
}

export function setGoal(root, g) {
  const acc = root.accounts[root.selected];
  if (!acc) return;
  acc.data.goal_ml = Math.max(1, Math.round(Number(g)));
  saveRoot(root);
}

export function addEntry(root, ml) {
  const acc = root.accounts[root.selected];
  if (!acc) return;
  const st = acc.data;
  const k = todayKey();
  st.days[k] ||= { entries: [] };
  const now = new Date();
  st.days[k].entries.push({ ml: Number(ml), ts: now.toTimeString().slice(0,5) });
  saveRoot(root);
}

export function undoLast(root) {
  const acc = root.accounts[root.selected];
  if (!acc) return 0;
  const st = acc.data;
  const k = todayKey();
  const entries = st.days[k]?.entries || [];
  const last = entries.pop();
  saveRoot(root);
  return last?.ml ?? 0;
}

export function resetToday(root) {
  const acc = root.accounts[root.selected];
  if (!acc) return;
  acc.data.days[todayKey()] = { entries: [] };
  saveRoot(root);
}

export function todayTotal(root) {
  const acc = root.accounts[root.selected];
  if (!acc) return 0;
  const st = acc.data;
  const k = todayKey();
  const entries = st.days[k]?.entries || [];
  return entries.reduce((a, e) => a + Number(e.ml || 0), 0);
}

export function historyTotals(root, days = 14) {
  const acc = root.accounts[root.selected];
  if (!acc) return [];
  const st = acc.data;
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

export { todayKey };
