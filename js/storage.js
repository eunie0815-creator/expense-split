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
