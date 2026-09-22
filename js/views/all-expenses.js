// A minimal, standalone page listing every expense in a group -- linked
// to (in a new tab) from the group page's "Show all expenses" button,
// which only shows the 4 most recent inline.

import { getGroup, listMembers, listExpenses } from "../db.js";
import { getSavedGroup, removeSavedGroup } from "../storage.js";
import { escapeHtml } from "../util.js";
import { expensesHtml, wireExpenseList } from "./expense-list.js";

export async function renderAllExpenses(mountEl, { id }) {
  const saved = getSavedGroup(id);
  if (!saved) {
    // No local passcode session in this tab -- send them to unlock first.
    location.hash = `#/g/${id}`;
    return;
  }

  mountEl.innerHTML = `<p class="center-note">Loading&hellip;</p>`;

  try {
    const group = await getGroup(id, saved.token);
    if (!group) throw new Error("group not visible with this token");

    const members = await listMembers(id, saved.token);
    const expenses = await listExpenses(id, saved.token);
    render(mountEl, { id, token: saved.token, name: group.name }, members, expenses);
  } catch (err) {
    console.error(err);
    removeSavedGroup(id);
    location.hash = `#/g/${id}`;
  }
}

function render(mountEl, group, members, expenses) {
  mountEl.innerHTML = `
    <div class="stack">
      <a href="#/g/${group.id}" class="muted">&larr; ${escapeHtml(group.name)}</a>
      <h1 class="font-display" style="font-size: 1.5rem; margin: 0; color: var(--ocean);">
        All Expenses
      </h1>

      <div class="card stack-sm">
        <div id="expense-list" class="stack-sm">${expensesHtml(members, expenses, group.id)}</div>
        <p id="expense-error" class="form-error"></p>
      </div>
    </div>
  `;

  wireExpenseList(mountEl, group, () => renderAllExpenses(mountEl, { id: group.id }));
}
