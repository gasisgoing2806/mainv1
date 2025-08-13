
const KEY = "waterTracker";

function todayKey() {
  const d = new Date();
  return d.toISOString().slice(0,10);
}

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { goal_ml: 2000, days: { [todayKey()]: { entries: [] } } };
    const obj = JSON.parse(raw);
    if (!obj.days) obj.days = {};
    if (!obj.goal_ml) obj.goal_ml = 2000;
    if (!obj.days[todayKey()]) obj.days[todayKey()] = { entries: [] };
    return obj;
  } catch (e) {
    console.warn("Corrupted state, resetting", e);
    return { goal_ml: 2000, days: { [todayKey()]: { entries: [] } } };
  }
}

function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function addEntry(state, ml) {
  const k = todayKey();
  state.days[k] ??= { entries: [] };
  const now = new Date();
  state.days[k].entries.push({ ml: Number(ml), ts: now.toTimeString().slice(0,5) });
  saveState(state);
}

function undoLast(state) {
  const k = todayKey();
  const entries = state.days[k]?.entries || [];
  const last = entries.pop();
  saveState(state);
  return last?.ml ?? 0;
}

function todayTotal(state) {
  const k = todayKey();
  const entries = state.days[k]?.entries || [];
  return entries.reduce((a, e) => a + Number(e.ml || 0), 0);
}

function historyTotals(state, days = 14) {
  const result = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0,10);
    const total = (state.days[key]?.entries || []).reduce((a, e) => a + Number(e.ml || 0), 0);
    result.push([key, total]);
  }
  return result;
}

export { todayKey, loadState, saveState, addEntry, undoLast, todayTotal, historyTotals };
