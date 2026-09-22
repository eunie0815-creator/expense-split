// Shared between the group page (which shows only the most recent few)
// and the "all expenses" page (which shows everything) -- same row
// markup and the same two-step delete confirmation either way.

import { deleteExpense } from "../db.js";
import { escapeHtml } from "../util.js";
import { formatMoney } from "../money.js";
import { memberDotHtml } from "../colors.js";

export function expensesHtml(members, expenses, groupId) {
  if (!expenses.length) {
    return '<p class="muted">No expenses yet.</p>';
  }
  const memberById = new Map(members.map((m) => [m.id, m]));
  return expenses.map((e) => expenseRowHtml(e, memberById, groupId)).join("");
}

function expenseRowHtml(e, memberById, groupId) {
  const payer = memberById.get(e.paid_by);
  const badgeClass = e.kind === "payment" ? "badge-ocean" : "badge-sunset";
  const kindLabel = e.kind === "payment" ? "Payment" : "Expense";
  return `
    <div class="expense-row" data-expense-id="${e.id}">
      <div class="row-between">
        <div>
          <strong>${escapeHtml(e.title)}</strong>
          <div class="muted">
            ${memberDotHtml(payer?.color)}${escapeHtml(payer?.name ?? "Unknown")} paid &middot; ${e.spent_on}
          </div>
        </div>
        <div style="text-align: right;">
          <div>${formatMoney(Number(e.amount), e.currency)}</div>
          <span class="badge ${badgeClass}">${kindLabel}</span>
        </div>
      </div>
      <div class="row" style="justify-content: flex-end; margin-top: 0.4rem; gap: 0.4rem;">
        <a class="icon-btn" href="#/g/${groupId}/edit/${e.id}" aria-label="Edit expense" title="Edit">&#9998;</a>
        <button class="icon-btn icon-btn-danger" data-delete-expense="${e.id}" aria-label="Delete expense" title="Delete">&times;</button>
      </div>
    </div>
  `;
}

// `reload` is called after a successful delete -- the group page reloads
// itself (balances/settle-up depend on the deleted expense too), while
// the all-expenses page just re-fetches its own list.
export function wireExpenseList(mountEl, group, reload) {
  const listEl = mountEl.querySelector("#expense-list");
  const errorEl = mountEl.querySelector("#expense-error");

  listEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-delete-expense]");
    if (!btn) return;
    errorEl.textContent = "";

    if (btn.dataset.armed !== "true") {
      btn.dataset.armed = "true";
      btn.classList.add("armed");
      btn.textContent = "Confirm?";
      return;
    }

    const expenseId = btn.dataset.deleteExpense;
    btn.disabled = true;
    try {
      await deleteExpense(expenseId, group.token);
      reload();
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Couldn't delete that expense. Try again.";
      btn.disabled = false;
      btn.classList.remove("armed");
      btn.textContent = "×";
      btn.dataset.armed = "false";
    }
  });
}
