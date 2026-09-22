import {
  getGroup,
  unlockGroup,
  updateGroupName,
  listMembers,
  addMember,
  updateMember,
  deleteMember,
  listExpenses,
  listExpenseShares,
  deleteExpense,
} from "../db.js";
import {
  getSavedGroup,
  saveGroup,
  removeSavedGroup,
  getSimplifyDebts,
  setSimplifyDebts,
} from "../storage.js";
import { escapeHtml } from "../util.js";
import { formatMoney } from "../money.js";
import { computeBalances, settleUp, computePairwiseDebts } from "../balances.js";
import { MEMBER_COLORS, nextAvailableColor, memberDotHtml, contrastTextColor } from "../colors.js";

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
  const simplify = getSimplifyDebts(group.id);
  const payments = simplify ? settleUp(balances) : computePairwiseDebts(members, expenses, shares);

  mountEl.innerHTML = `
    <div class="stack">
      <a href="#/" class="muted">&larr; Your groups</a>

      <div class="row-between">
        <div id="group-name-display">
          <h1 class="font-display row" style="font-size: 1.5rem; margin: 0; color: var(--ocean); gap: 0.35rem;" id="group-name-text">
            ${escapeHtml(group.name)}
            <button class="icon-btn" id="edit-group-name-btn" aria-label="Edit group name" title="Edit group name">&#9998;</button>
          </h1>
          <div class="muted">base currency ${escapeHtml(group.baseCurrency)}</div>
        </div>
        <a href="#/g/${group.id}/add" class="btn btn-primary">+ Add</a>
      </div>
      <div id="group-name-edit" class="row" hidden>
        <input class="input-field" id="group-name-input" value="${escapeHtml(group.name)}" />
        <button class="btn btn-primary btn-sm" id="save-group-name-btn">Save</button>
        <button class="btn btn-ghost btn-sm" id="cancel-group-name-btn">Cancel</button>
      </div>
      <p id="group-name-error" class="form-error"></p>

      <div class="card stack-sm">
        <strong>Members</strong>
        <div id="member-list" class="stack-sm">${membersHtml(members)}</div>
        <button class="btn btn-ghost btn-sm" id="new-member-btn" style="margin-top: 0.5rem;">+ New Member</button>
        <div id="new-member-form" class="stack-sm" style="margin-top: 0.5rem;" hidden>
          <div class="row">
            <input class="input-field" id="new-member-name" placeholder="Add a member's name" />
            <button class="btn btn-secondary" id="add-member-btn">Add</button>
            <button class="icon-btn" id="cancel-new-member-btn" aria-label="Close" title="Close">&times;</button>
          </div>
          ${colorSwatchesHtml("add-member", nextAvailableColor(members))}
        </div>
        <p id="member-error" class="form-error"></p>
      </div>

      <div class="card stack-sm">
        <strong>Balances</strong>
        <div class="stack-sm">${balancesHtml(balances, group.baseCurrency)}</div>
      </div>

      <div class="card stack-sm">
        <div class="row-between">
          <strong>Settle Up</strong>
          <label class="switch">
            <input type="checkbox" id="simplify-toggle" ${simplify ? "checked" : ""} />
            <span class="switch-track"><span class="switch-thumb"></span></span>
            Simplify debts
          </label>
        </div>
        <div id="settle-up-content" class="stack-sm">${settleUpHtml(payments, group.baseCurrency, members)}</div>
      </div>

      <div class="card stack-sm">
        <strong>Expenses</strong>
        <div id="expense-list" class="stack-sm">${expensesHtml(members, expenses, group.id)}</div>
        <p id="expense-error" class="form-error"></p>
      </div>
    </div>
  `;

  wireGroupName(mountEl, group);
  wireMemberList(mountEl, group, members);
  wireExpenseList(mountEl, group);
  wireSettleUpToggle(mountEl, group, members, expenses, shares);
}

function wireSettleUpToggle(mountEl, group, members, expenses, shares) {
  const toggle = mountEl.querySelector("#simplify-toggle");
  const content = mountEl.querySelector("#settle-up-content");

  toggle.addEventListener("change", () => {
    setSimplifyDebts(group.id, toggle.checked);
    const payments = toggle.checked
      ? settleUp(computeBalances(members, expenses, shares))
      : computePairwiseDebts(members, expenses, shares);
    content.innerHTML = settleUpHtml(payments, group.baseCurrency, members);
  });
}

function wireGroupName(mountEl, group) {
  const displayEl = mountEl.querySelector("#group-name-display");
  const editEl = mountEl.querySelector("#group-name-edit");
  const input = mountEl.querySelector("#group-name-input");
  const errorEl = mountEl.querySelector("#group-name-error");
  const saveBtn = mountEl.querySelector("#save-group-name-btn");

  mountEl.querySelector("#edit-group-name-btn").addEventListener("click", () => {
    errorEl.textContent = "";
    displayEl.hidden = true;
    editEl.hidden = false;
    input.value = group.name;
    input.focus();
    input.select();
  });

  const cancel = () => {
    errorEl.textContent = "";
    editEl.hidden = true;
    displayEl.hidden = false;
  };

  mountEl.querySelector("#cancel-group-name-btn").addEventListener("click", cancel);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") cancel();
  });

  const save = async () => {
    const name = input.value.trim();
    errorEl.textContent = "";
    if (!name) return;
    if (name === group.name) {
      cancel();
      return;
    }

    saveBtn.disabled = true;
    try {
      await updateGroupName(group.id, group.token, name);
      saveGroup({ id: group.id, name, baseCurrency: group.baseCurrency, token: group.token });
      renderGroup(mountEl, { id: group.id });
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Couldn't rename the group. Try again.";
      saveBtn.disabled = false;
    }
  };

  saveBtn.addEventListener("click", save);
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

function settleUpHtml(payments, baseCurrency, members) {
  if (!payments.length) {
    return '<p class="muted">Nothing to settle up.</p>';
  }
  const colorById = new Map(members.map((m) => [m.id, m.color]));
  return payments
    .map(
      (p) => `
        <div class="row-between">
          <span>
            ${memberDotHtml(colorById.get(p.fromId))}${escapeHtml(p.from)}
            &rarr;
            ${memberDotHtml(colorById.get(p.toId))}${escapeHtml(p.to)}
          </span>
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

function membersHtml(members) {
  if (!members.length) return '<p class="muted">No members yet.</p>';
  return members.map(memberRowHtml).join("");
}

function memberRowHtml(m) {
  const badgeStyle = m.color
    ? ` style="background:#${m.color}; color:${contrastTextColor(m.color)};"`
    : "";
  return `
    <div class="member-row" data-member-row="${m.id}">
      <span class="badge${m.color ? "" : " badge-ocean"}"${badgeStyle}>${escapeHtml(m.name)}</span>
      <div class="row" style="gap: 0.4rem;">
        <button class="icon-btn" data-edit="${m.id}" aria-label="Edit ${escapeHtml(m.name)}" title="Edit">&#9998;</button>
        <button class="icon-btn icon-btn-danger" data-remove="${m.id}" aria-label="Remove ${escapeHtml(m.name)}" title="Remove">&times;</button>
      </div>
    </div>
  `;
}

function memberEditRowHtml(m) {
  return `
    <div class="member-row stack-sm" data-member-row="${m.id}" style="flex-direction: column; align-items: stretch;">
      <div class="row">
        <input class="input-field" data-member-name-input value="${escapeHtml(m.name)}" style="flex: 1;" />
        <button class="btn btn-primary btn-sm" data-save-member="${m.id}">Save</button>
        <button class="btn btn-ghost btn-sm" data-cancel-member="${m.id}">Cancel</button>
      </div>
      ${colorSwatchesHtml(`edit-member-${m.id}`, m.color ?? MEMBER_COLORS[0])}
    </div>
  `;
}

// A row of clickable color-swatch circles for `groupKey`. The currently
// selected color is tracked in the container's own dataset (read back at
// add/save time) rather than in JS state, since these rows are rebuilt
// wholesale on every render.
function colorSwatchesHtml(groupKey, selectedColor) {
  const swatches = MEMBER_COLORS.map(
    (c) => `
      <button type="button" class="color-swatch" data-color-swatch="${c}"
              aria-pressed="${c === selectedColor}" style="background:#${c};"
              aria-label="Color ${c}"></button>
    `
  ).join("");
  return `
    <div class="color-swatches" data-swatch-group="${groupKey}" data-selected-color="${selectedColor}">
      ${swatches}
    </div>
  `;
}

function wireMemberList(mountEl, group, members) {
  const listEl = mountEl.querySelector("#member-list");
  const input = mountEl.querySelector("#new-member-name");
  const addBtn = mountEl.querySelector("#add-member-btn");
  const errorEl = mountEl.querySelector("#member-error");
  const newMemberBtn = mountEl.querySelector("#new-member-btn");
  const newMemberForm = mountEl.querySelector("#new-member-form");
  const cancelNewMemberBtn = mountEl.querySelector("#cancel-new-member-btn");
  let addSwatchGroup = mountEl.querySelector('[data-swatch-group="add-member"]');

  const renderList = () => {
    listEl.innerHTML = membersHtml(members);
  };

  newMemberBtn.addEventListener("click", () => {
    newMemberBtn.hidden = true;
    newMemberForm.hidden = false;
    input.focus();
  });

  cancelNewMemberBtn.addEventListener("click", () => {
    errorEl.textContent = "";
    input.value = "";
    newMemberForm.hidden = true;
    newMemberBtn.hidden = false;
  });

  // Delegated on mountEl (not listEl) since the add-member swatches live
  // outside the member list, alongside per-member edit-row swatches
  // inside it -- one listener covers both.
  mountEl.addEventListener("click", (e) => {
    const swatchBtn = e.target.closest("[data-color-swatch]");
    if (!swatchBtn) return;
    const container = swatchBtn.closest("[data-swatch-group]");
    container.dataset.selectedColor = swatchBtn.dataset.colorSwatch;
    container.querySelectorAll("[data-color-swatch]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b === swatchBtn));
    });
  });

  const addMemberHandler = async () => {
    const name = input.value.trim();
    const color = addSwatchGroup.dataset.selectedColor;
    errorEl.textContent = "";
    if (!name) return;

    addBtn.disabled = true;
    try {
      const member = await addMember(group.id, group.token, name, color);
      members.push(member);
      members.sort((a, b) => a.name.localeCompare(b.name));
      renderList();
      input.value = "";
      input.focus();
      // Re-pick the next unused color for whoever's added next.
      addSwatchGroup.outerHTML = colorSwatchesHtml("add-member", nextAvailableColor(members));
      addSwatchGroup = mountEl.querySelector('[data-swatch-group="add-member"]');
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
    if (e.key === "Escape") cancelNewMemberBtn.click();
  });

  // Two-step remove: first click arms it ("Confirm?"), second click
  // actually deletes. Avoids a native confirm() popup, which looks out
  // of place next to the rest of the theme.
  listEl.addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) {
      errorEl.textContent = "";
      const memberId = editBtn.dataset.edit;
      const member = members.find((m) => m.id === memberId);
      const row = listEl.querySelector(`[data-member-row="${memberId}"]`);
      row.outerHTML = memberEditRowHtml(member);
      const rowEl = listEl.querySelector(`[data-member-row="${memberId}"]`);
      const input = rowEl.querySelector("[data-member-name-input]");
      input.focus();
      input.select();
      return;
    }

    const cancelBtn = e.target.closest("[data-cancel-member]");
    if (cancelBtn) {
      errorEl.textContent = "";
      renderList();
      return;
    }

    const saveBtn = e.target.closest("[data-save-member]");
    if (saveBtn) {
      errorEl.textContent = "";
      const memberId = saveBtn.dataset.saveMember;
      const member = members.find((m) => m.id === memberId);
      const rowEl = listEl.querySelector(`[data-member-row="${memberId}"]`);
      const input = rowEl.querySelector("[data-member-name-input]");
      const swatchGroup = rowEl.querySelector("[data-swatch-group]");
      const name = input.value.trim();
      const color = swatchGroup.dataset.selectedColor;
      if (!name) return;
      if (name === member.name && color === member.color) {
        renderList();
        return;
      }

      saveBtn.disabled = true;
      try {
        await updateMember(memberId, group.token, { name, color });
        renderGroup(mountEl, { id: group.id });
      } catch (err) {
        console.error(err);
        errorEl.textContent = "Couldn't save that member (maybe that name is already used?).";
        saveBtn.disabled = false;
      }
      return;
    }

    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    errorEl.textContent = "";

    if (btn.dataset.armed !== "true") {
      btn.dataset.armed = "true";
      btn.classList.add("armed");
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
      btn.classList.remove("armed");
      btn.textContent = "×";
      btn.dataset.armed = "false";
    }
  });

  listEl.addEventListener("keydown", (e) => {
    if (!e.target.matches("[data-member-name-input]")) return;
    if (e.key === "Enter") {
      e.target.closest(".member-row").querySelector("[data-save-member]").click();
    }
    if (e.key === "Escape") {
      renderList();
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
      btn.classList.add("armed");
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
      btn.classList.remove("armed");
      btn.textContent = "×";
      btn.dataset.armed = "false";
    }
  });
}
