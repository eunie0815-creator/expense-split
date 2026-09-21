import {
  getGroup,
  unlockGroup,
  listMembers,
  addMember,
  deleteMember,
  listExpenses,
  listExpenseShares,
  deleteExpense,
} from "../db.js";
import { getSavedGroup, saveGroup, removeSavedGroup } from "../storage.js";
import { escapeHtml } from "../util.js";
import { formatMoney } from "../money.js";
import { computeBalances, settleUp } from "../balances.js";

export async function renderGroup(mountEl, { id }) {
  const saved = getSavedGroup(id);

  if (!saved) {
    renderUnlockForm(mountEl, id);
    return;
  }

  mountEl.innerHTML = `<p class="center-note">Loading&hellip;</p>`;

  try {
    const group = await getGroup(id, saved.token);
    if (!group) throw new Error("group not visible with this token");

    // Keep the local cache in sync in case the name/currency changed.
    saveGroup({ id, name: group.name, baseCurrency: group.base_currency, token: saved.token });

    const members = await listMembers(id, saved.token);
    const expenses = await listExpenses(id, saved.token);
    const shares = await listExpenseShares(expenses.map((e) => e.id), saved.token);
    renderGroupPage(
      mountEl,
      { id, token: saved.token, name: group.name, baseCurrency: group.base_currency },
      members,
      expenses,
      shares
    );
  } catch (err) {
    console.error(err);
    // The saved token no longer works (e.g. group was recreated) -- fall
    // back to asking for the passcode again rather than showing a dead end.
    removeSavedGroup(id);
    renderUnlockForm(mountEl, id);
  }
}

function renderUnlockForm(mountEl, id) {
  mountEl.innerHTML = `
    <div class="stack" style="max-width: 24rem; margin: 2rem auto 0;">
      <h1 class="font-display" style="font-size: 1.5rem; color: var(--ocean);">Enter Passcode</h1>
      <p class="muted">Ask whoever shared this link for the group passcode.</p>
      <div>
        <label for="unlock-passcode">Passcode</label>
        <input class="input-field" id="unlock-passcode" type="password" autocomplete="off" />
      </div>
      <p id="unlock-error" class="form-error"></p>
      <button class="btn btn-primary" id="unlock-submit" style="width: 100%;">Unlock</button>
      <a href="#/" class="muted" style="text-align: center; display: block;">&larr; Back to your groups</a>
    </div>
  `;

  const passcodeInput = mountEl.querySelector("#unlock-passcode");
  const errorEl = mountEl.querySelector("#unlock-error");
  const submitBtn = mountEl.querySelector("#unlock-submit");

  const submit = async () => {
    const passcode = passcodeInput.value;
    errorEl.textContent = "";
    if (!passcode) return;

    submitBtn.disabled = true;
    try {
      const token = await unlockGroup(id, passcode);
      if (!token) {
        errorEl.textContent = "Wrong passcode.";
        submitBtn.disabled = false;
        return;
      }
      const group = await getGroup(id, token);
      saveGroup({ id, name: group.name, baseCurrency: group.base_currency, token });
      renderGroup(mountEl, { id });
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Something went wrong. Try again.";
      submitBtn.disabled = false;
    }
  };

  submitBtn.addEventListener("click", submit);
  passcodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

function renderGroupPage(mountEl, group, members, expenses, shares) {
  const balances = computeBalances(members, expenses, shares);
  const payments = settleUp(balances);

  mountEl.innerHTML = `
    <div class="stack">
      <a href="#/" class="muted">&larr; Your groups</a>

      <div class="row-between">
        <div>
          <h1 class="font-display" style="font-size: 1.5rem; margin: 0; color: var(--ocean);">
            ${escapeHtml(group.name)}
          </h1>
          <div class="muted">base currency ${escapeHtml(group.baseCurrency)}</div>
        </div>
        <a href="#/g/${group.id}/add" class="btn btn-primary">+ Add</a>
      </div>

      <div class="card stack-sm">
        <strong>Members</strong>
        <div id="member-list" class="stack-sm">${membersHtml(members)}</div>
        <div class="row" style="margin-top: 0.5rem;">
          <input class="input-field" id="new-member-name" placeholder="Add a member's name" />
          <button class="btn btn-secondary" id="add-member-btn">Add</button>
        </div>
        <p id="member-error" class="form-error"></p>
      </div>

      <div class="card stack-sm">
        <strong>Balances</strong>
        <div class="stack-sm">${balancesHtml(balances, group.baseCurrency)}</div>
      </div>

      <div class="card stack-sm">
        <strong>Settle Up</strong>
        <div class="stack-sm">${settleUpHtml(payments, group.baseCurrency)}</div>
      </div>

      <div class="card stack-sm">
        <strong>Expenses</strong>
        <div id="expense-list" class="stack-sm">${expensesHtml(members, expenses, group.id)}</div>
        <p id="expense-error" class="form-error"></p>
      </div>
    </div>
  `;

  wireMemberList(mountEl, group, members);
  wireExpenseList(mountEl, group);
}

function balancesHtml(balances, baseCurrency) {
  if (!balances.length) return '<p class="muted">No members yet.</p>';
  return balances.map((b) => balanceRowHtml(b, baseCurrency)).join("");
}

function balanceRowHtml(b, baseCurrency) {
  let badge;
  if (b.balance > 0.001) {
    badge = `<span class="badge badge-ocean">is owed ${formatMoney(b.balance, baseCurrency)}</span>`;
  } else if (b.balance < -0.001) {
    badge = `<span class="badge badge-sunset">owes ${formatMoney(-b.balance, baseCurrency)}</span>`;
  } else {
    badge = `<span class="muted">settled up</span>`;
  }
  return `
    <div class="row-between">
      <span>${escapeHtml(b.name)}</span>
      ${badge}
    </div>
  `;
}

function settleUpHtml(payments, baseCurrency) {
  if (!payments.length) {
    return '<p class="muted">Nothing to settle up.</p>';
  }
  return payments
    .map(
      (p) => `
        <div class="row-between">
          <span>${escapeHtml(p.from)} &rarr; ${escapeHtml(p.to)}</span>
          <strong>${formatMoney(p.amount, baseCurrency)}</strong>
        </div>
      `
    )
    .join("");
}

function expensesHtml(members, expenses, groupId) {
  if (!expenses.length) {
    return '<p class="muted">No expenses yet.</p>';
  }
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  return expenses.map((e) => expenseRowHtml(e, nameById, groupId)).join("");
}

function expenseRowHtml(e, nameById, groupId) {
  const payer = nameById.get(e.paid_by) ?? "Unknown";
  const badgeClass = e.kind === "payment" ? "badge-ocean" : "badge-sunset";
  const kindLabel = e.kind === "payment" ? "Payment" : "Expense";
  return `
    <div class="expense-row" data-expense-id="${e.id}">
      <div class="row-between">
        <div>
          <strong>${escapeHtml(e.title)}</strong>
          <div class="muted">${escapeHtml(payer)} paid &middot; ${e.spent_on}</div>
        </div>
        <div style="text-align: right;">
          <div>${formatMoney(Number(e.amount), e.currency)}</div>
          <span class="badge ${badgeClass}">${kindLabel}</span>
        </div>
      </div>
      <div class="row" style="justify-content: flex-end; margin-top: 0.4rem;">
        <a class="btn btn-ghost btn-sm" href="#/g/${groupId}/edit/${e.id}">Edit</a>
        <button class="btn btn-ghost btn-sm" data-delete-expense="${e.id}">Delete</button>
      </div>
    </div>
  `;
}

function membersHtml(members) {
  if (!members.length) return '<p class="muted">No members yet.</p>';
  return members.map(memberRowHtml).join("");
}

function memberRowHtml(m) {
  return `
    <div class="member-row">
      <span class="badge badge-ocean">${escapeHtml(m.name)}</span>
      <button class="btn btn-ghost btn-sm" data-remove="${m.id}">Remove</button>
    </div>
  `;
}

function wireMemberList(mountEl, group, members) {
  const listEl = mountEl.querySelector("#member-list");
  const input = mountEl.querySelector("#new-member-name");
  const addBtn = mountEl.querySelector("#add-member-btn");
  const errorEl = mountEl.querySelector("#member-error");

  const renderList = () => {
    listEl.innerHTML = membersHtml(members);
  };

  const addMemberHandler = async () => {
    const name = input.value.trim();
    errorEl.textContent = "";
    if (!name) return;

    addBtn.disabled = true;
    try {
      const member = await addMember(group.id, group.token, name);
      members.push(member);
      members.sort((a, b) => a.name.localeCompare(b.name));
      renderList();
      input.value = "";
      input.focus();
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Couldn't add that member (maybe that name is already used?).";
    } finally {
      addBtn.disabled = false;
    }
  };

  addBtn.addEventListener("click", addMemberHandler);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addMemberHandler();
  });

  // Two-step remove: first click arms it ("Confirm?"), second click
  // actually deletes. Avoids a native confirm() popup, which looks out
  // of place next to the rest of the theme.
  listEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    errorEl.textContent = "";

    if (btn.dataset.armed !== "true") {
      btn.dataset.armed = "true";
      btn.textContent = "Confirm?";
      return;
    }

    const memberId = btn.dataset.remove;
    btn.disabled = true;
    try {
      await deleteMember(memberId, group.token);
      const idx = members.findIndex((m) => m.id === memberId);
      if (idx >= 0) members.splice(idx, 1);
      renderList();
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Couldn't remove that member -- they may already have expenses recorded.";
      btn.disabled = false;
      btn.textContent = "Remove";
      btn.dataset.armed = "false";
    }
  });
}

function wireExpenseList(mountEl, group) {
  const listEl = mountEl.querySelector("#expense-list");
  const errorEl = mountEl.querySelector("#expense-error");

  // Same two-step confirm pattern as removing a member. Deleting an
  // expense changes every balance and settle-up suggestion, so on
  // success we just reload the whole group view rather than patching
  // numbers in place.
  listEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-delete-expense]");
    if (!btn) return;
    errorEl.textContent = "";

    if (btn.dataset.armed !== "true") {
      btn.dataset.armed = "true";
      btn.textContent = "Confirm?";
      return;
    }

    const expenseId = btn.dataset.deleteExpense;
    btn.disabled = true;
    try {
      await deleteExpense(expenseId, group.token);
      renderGroup(mountEl, { id: group.id });
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Couldn't delete that expense. Try again.";
      btn.disabled = false;
      btn.textContent = "Delete";
      btn.dataset.armed = "false";
    }
  });
}
