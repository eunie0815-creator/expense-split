// Remembers which groups this browser has unlocked, so returning to the
// app (or reopening the shared link) doesn't ask for the passcode again.
// This is purely a local convenience cache -- the real gate is always
// the server-side RLS check, not anything stored here.

const KEY = "expense-split:groups";

export function listSavedGroups() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function getSavedGroup(id) {
  return listSavedGroups().find((g) => g.id === id) ?? null;
}

// group: { id, name, baseCurrency, token }
export function saveGroup(group) {
  const groups = listSavedGroups().filter((g) => g.id !== group.id);
  groups.unshift(group);
  localStorage.setItem(KEY, JSON.stringify(groups));
}

export function removeSavedGroup(id) {
  const groups = listSavedGroups().filter((g) => g.id !== id);
  localStorage.setItem(KEY, JSON.stringify(groups));
}

const SIMPLIFY_KEY_PREFIX = "expense-split:simplify-debts:";

// Whether the Settle Up card shows the min-cash-flow simplified
// suggestions (true, the default) or direct pairwise debts (false).
// Stored per group so the choice survives a reload.
export function getSimplifyDebts(groupId) {
  try {
    const raw = localStorage.getItem(SIMPLIFY_KEY_PREFIX + groupId);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

export function setSimplifyDebts(groupId, value) {
  try {
    localStorage.setItem(SIMPLIFY_KEY_PREFIX + groupId, String(value));
  } catch {}
}
