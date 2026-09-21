import {
  getGroup,
  listMembers,
  getExpense,
  listExpenseShares,
  addExpense,
  addExpenseShares,
  updateExpense,
  deleteExpenseShares,
  deleteExpense,
} from "../db.js";
import { getRate } from "../fx.js";
import { splitEqually, sumAmounts, roundToCents } from "../money.js";
import { getSavedGroup } from "../storage.js";
import { escapeHtml } from "../util.js";
import { CURRENCIES } from "../currencies.js";

export async function renderAddExpense(mountEl, { id }) {
  return renderExpenseForm(mountEl, { id, expenseId: null });
}

export async function renderEditExpense(mountEl, { id, expenseId }) {
  return renderExpenseForm(mountEl, { id, expenseId });
}

async function renderExpenseForm(mountEl, { id, expenseId }) {
  const saved = getSavedGroup(id);
  if (!saved) {
    location.hash = `#/g/${id}`; // let the group view ask for the passcode
    return;
  }

  mountEl.innerHTML = `<p class="center-note">Loading&hellip;</p>`;

  let group, members, existing, existingShares;
  try {
    group = await getGroup(id, saved.token);
    members = await listMembers(id, saved.token);
    if (expenseId) {
      existing = await getExpense(expenseId, saved.token);
      existingShares = existing ? await listExpenseShares([expenseId], saved.token) : [];
      if (!existing) throw new Error("expense not found");
    }
  } catch (err) {
    console.error(err);
    location.hash = `#/g/${id}`;
    return;
  }

  if (members.length < 1) {
    mountEl.innerHTML = `
      <p class="center-note">Add at least one member before recording an expense.</p>
      <a href="#/g/${id}" class="btn btn-secondary" style="display: block; text-align: center;">
        &larr; Back to ${escapeHtml(group.name)}
      </a>
    `;
    return;
  }

  const state = buildInitialState(id, saved.token, group, members, existing, existingShares);

  mountEl.innerHTML = formHtml(group, members, state);
  wireForm(mountEl, group, members, state);
}

function buildInitialState(groupId, token, group, members, existing, existingShares) {
  const today = new Date().toISOString().slice(0, 10);

  const state = {
    groupId,
    token,
    baseCurrency: group.base_currency,
    expenseId: existing?.id ?? null,
    mode: existing?.kind === "payment" ? "payment" : "expense",
    // Edits always start in "custom" mode, pre-filled with the actual
    // stored shares -- we don't persist how a split was originally
    // entered, so showing the real numbers is more honest than guessing.
    splitType: existing ? "custom" : "equal",
    selected: new Set(members.map((m) => m.id)),
    customAmounts: new Map(),
    forMemberId: null,
    initial: {
      // The title field is hidden and untouched in "payment" mode, so its
      // stored value is always an auto-generated "Payment to X" string --
      // leave it blank here so a changed recipient regenerates it on save
      // instead of keeping stale text naming the old recipient.
      title: existing?.kind === "payment" ? "" : existing?.title ?? "",
      amount: existing?.amount != null ? String(existing.amount) : "",
      currency: existing?.currency ?? group.base_currency,
      date: existing?.spent_on ?? today,
      paidBy: existing?.paid_by ?? members[0]?.id ?? "",
      note: existing?.note ?? "",
    },
  };

  if (!existing) return state;

  // Back-convert each stored share (in base currency) to the expense's
  // original currency, so the edit form shows the numbers the person
  // actually typed rather than the converted ones.
  const rate = Number(existing.rate_to_base) || 1;

  if (existing.kind === "payment") {
    state.forMemberId = existingShares[0]?.member_id ?? null;
  } else {
    state.selected = new Set(existingShares.map((s) => s.member_id));
    for (const s of existingShares) {
      state.customAmounts.set(s.member_id, roundToCents(Number(s.share_base) / rate));
    }
  }

  return state;
}

function formHtml(group, members, state) {
  const memberOptions = members
    .map(
      (m) =>
        `<option value="${m.id}"${m.id === state.initial.paidBy ? " selected" : ""}>${escapeHtml(m.name)}</option>`
    )
    .join("");

  const currencyOptions = CURRENCIES.map(
    (c) =>
      `<option value="${c.code}"${c.code === state.initial.currency ? " selected" : ""}>${c.flag} ${c.code}</option>`
  ).join("");

  const today = new Date().toISOString().slice(0, 10);
  const heading = state.expenseId ? "Edit Expense" : "Add Expense";
  const submitLabel = state.expenseId ? "Save Changes" : "Save";

  return `
    <div class="stack">
      <a href="#/g/${group.id}" class="muted">&larr; ${escapeHtml(group.name)}</a>
      <h1 class="font-display" style="font-size: 1.5rem; margin: 0; color: var(--ocean);">
        ${heading}
      </h1>

      <div class="row" id="mode-toggle" style="gap: 0.5rem;">
        <button type="button" class="btn ${state.mode === "expense" ? "btn-secondary" : "btn-ghost"}"
                data-mode="expense" style="flex: 1;">Group Expense</button>
        <button type="button" class="btn ${state.mode === "payment" ? "btn-secondary" : "btn-ghost"}"
                data-mode="payment" style="flex: 1;">Paid For Someone</button>
      </div>

      <div class="card stack">
        <div id="title-field"${state.mode === "payment" ? " hidden" : ""}>
          <label for="exp-title">Title</label>
          <input class="input-field" id="exp-title" placeholder="e.g. Airbnb, Dinner, Grab"
                 value="${escapeHtml(state.initial.title)}" />
        </div>

        <div class="row" style="align-items: flex-start;">
          <div style="flex: 1;">
            <label for="exp-amount">Amount</label>
            <input class="input-field" id="exp-amount" type="number" min="0.01" step="0.01"
                   value="${escapeHtml(state.initial.amount)}" />
          </div>
          <div style="width: 6rem;">
            <label for="exp-currency">Currency</label>
            <select class="input-field" id="exp-currency">${currencyOptions}</select>
          </div>
        </div>

        <div>
          <label for="exp-date">Date</label>
          <input class="input-field" id="exp-date" type="date" value="${state.initial.date}" max="${today}" />
        </div>

        <div>
          <label for="exp-paid-by">Paid by</label>
          <select class="input-field" id="exp-paid-by">${memberOptions}</select>
        </div>

        <div id="split-section"></div>

        <div>
          <label for="exp-note">Note (optional)</label>
          <input class="input-field" id="exp-note" placeholder="Optional details"
                 value="${escapeHtml(state.initial.note)}" />
        </div>

        <p id="exp-error" class="form-error"></p>

        <div class="row">
          <button class="btn btn-primary" id="exp-submit" style="flex: 1;">${submitLabel}</button>
          <a href="#/g/${group.id}" class="btn btn-ghost">Cancel</a>
        </div>
      </div>
    </div>
  `;
}

function splitSectionHtml(members, state) {
  if (state.mode === "payment") {
    const recipientOptions = members
      .map(
        (m) =>
          `<option value="${m.id}"${m.id === state.forMemberId ? " selected" : ""}>${escapeHtml(m.name)}</option>`
      )
      .join("");
    return `
      <div>
        <label for="exp-for">For</label>
        <select class="input-field" id="exp-for">${recipientOptions}</select>
        <p class="muted" style="margin: 0.4rem 0 0;">
          Whoever you picked above fronted the money; this records the whole amount as paid back to the person selected here.
        </p>
      </div>
    `;
  }

  const splitTypeToggle = `
    <div class="row" style="gap: 0.5rem;">
      <button type="button" class="btn ${state.splitType === "equal" ? "btn-secondary" : "btn-ghost"}"
              data-split-type="equal" style="flex: 1;">Equal</button>
      <button type="button" class="btn ${state.splitType === "custom" ? "btn-secondary" : "btn-ghost"}"
              data-split-type="custom" style="flex: 1;">Custom</button>
    </div>
  `;

  const rows = members
    .map((m) => {
      const checked = state.selected.has(m.id) ? "checked" : "";
      const prefill = state.customAmounts.get(m.id);
      const customInput =
        state.splitType === "custom"
          ? `<input class="input-field" data-custom-amount="${m.id}" type="number" min="0" step="0.01"
                    style="width: 6rem;" ${checked ? "" : "disabled"}
                    value="${prefill != null ? prefill : ""}" />`
          : "";
      return `
        <div class="row-between">
          <label style="display: flex; align-items: center; gap: 0.5rem; margin: 0; text-transform: none; font-weight: 400; font-size: 1rem; color: var(--ink);">
            <input type="checkbox" data-member-checkbox="${m.id}" ${checked} />
            ${escapeHtml(m.name)}
          </label>
          ${customInput}
        </div>
      `;
    })
    .join("");

  const remainderNote =
    state.splitType === "custom"
      ? `<p class="muted" id="split-remaining" style="margin: 0.4rem 0 0;"></p>`
      : "";

  return `
    <div>
      <label>Split between</label>
      ${splitTypeToggle}
      <div class="stack-sm" style="margin-top: 0.5rem;">${rows}</div>
      ${remainderNote}
    </div>
  `;
}

function wireForm(mountEl, group, members, state) {
  const errorEl = mountEl.querySelector("#exp-error");
  const submitBtn = mountEl.querySelector("#exp-submit");
  const titleField = mountEl.querySelector("#title-field");
  const splitSection = mountEl.querySelector("#split-section");

  function renderSplitSection() {
    splitSection.innerHTML = splitSectionHtml(members, state);
    wireSplitSection();
  }

  function wireSplitSection() {
    if (state.mode === "expense") {
      splitSection.querySelectorAll("[data-split-type]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.splitType = btn.dataset.splitType;
          renderSplitSection();
        });
      });
      splitSection.querySelectorAll("[data-member-checkbox]").forEach((cb) => {
        cb.addEventListener("change", () => {
          const memberId = cb.dataset.memberCheckbox;
          if (cb.checked) state.selected.add(memberId);
          else state.selected.delete(memberId);
          const input = splitSection.querySelector(`[data-custom-amount="${memberId}"]`);
          if (input) input.disabled = !cb.checked;
          updateRemaining();
        });
      });
      splitSection.querySelectorAll("[data-custom-amount]").forEach((input) => {
        input.addEventListener("input", updateRemaining);
      });
      updateRemaining();
    }
  }

  function updateRemaining() {
    if (state.mode !== "expense" || state.splitType !== "custom") return;
    const note = splitSection.querySelector("#split-remaining");
    if (!note) return;
    const amount = parseFloat(mountEl.querySelector("#exp-amount").value) || 0;
    const allocated = sumAmounts(
      [...state.selected].map((id) => {
        const input = splitSection.querySelector(`[data-custom-amount="${id}"]`);
        return parseFloat(input?.value) || 0;
      })
    );
    const remaining = roundToCents(amount - allocated);
    note.textContent =
      remaining === 0
        ? "Fully allocated."
        : `${remaining > 0 ? "Remaining" : "Over by"}: ${Math.abs(remaining).toFixed(2)}`;
    note.style.color = remaining === 0 ? "var(--ink-secondary)" : "var(--sunset-strong)";
  }

  mountEl.querySelectorAll("#mode-toggle [data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.mode = btn.dataset.mode;
      mountEl.querySelectorAll("#mode-toggle [data-mode]").forEach((b) => {
        b.className = b.dataset.mode === state.mode ? "btn btn-secondary" : "btn btn-ghost";
        b.style.flex = "1";
      });
      titleField.hidden = state.mode === "payment";
      renderSplitSection();
    });
  });

  mountEl.querySelector("#exp-amount").addEventListener("input", updateRemaining);

  renderSplitSection();

  submitBtn.addEventListener("click", () => handleSubmit(mountEl, group, members, state, errorEl, submitBtn));
}

async function handleSubmit(mountEl, group, members, state, errorEl, submitBtn) {
  errorEl.textContent = "";

  const amount = parseFloat(mountEl.querySelector("#exp-amount").value);
  const currency = mountEl.querySelector("#exp-currency").value;
  const spentOn = mountEl.querySelector("#exp-date").value;
  const paidBy = mountEl.querySelector("#exp-paid-by").value;
  const note = mountEl.querySelector("#exp-note").value.trim() || null;
  const rawTitle = mountEl.querySelector("#exp-title").value.trim();

  if (!amount || amount <= 0) {
    errorEl.textContent = "Enter an amount greater than 0.";
    return;
  }
  if (!spentOn) {
    errorEl.textContent = "Pick a date.";
    return;
  }

  let kind, title, shareAssignments;

  if (state.mode === "payment") {
    kind = "payment";
    const forMember = mountEl.querySelector("#exp-for").value;
    if (forMember === paidBy) {
      errorEl.textContent = "The payer and the recipient can't be the same person.";
      return;
    }
    const recipientName = members.find((m) => m.id === forMember)?.name ?? "";
    title = rawTitle || `Payment to ${recipientName}`;
    shareAssignments = [{ member_id: forMember, amount }];
  } else {
    kind = "expense";
    if (!rawTitle) {
      errorEl.textContent = "Give the expense a title.";
      return;
    }
    title = rawTitle;
    const selectedIds = [...state.selected];
    if (selectedIds.length === 0) {
      errorEl.textContent = "Select at least one person to split between.";
      return;
    }

    if (state.splitType === "equal") {
      const amounts = splitEqually(amount, selectedIds.length);
      shareAssignments = selectedIds.map((memberId, i) => ({ member_id: memberId, amount: amounts[i] }));
    } else {
      shareAssignments = selectedIds.map((memberId) => {
        const input = mountEl.querySelector(`[data-custom-amount="${memberId}"]`);
        return { member_id: memberId, amount: parseFloat(input?.value) || 0 };
      });
      const allocated = sumAmounts(shareAssignments.map((s) => s.amount));
      if (roundToCents(allocated - amount) !== 0) {
        errorEl.textContent = `Custom amounts must add up to ${amount.toFixed(2)} (currently ${allocated.toFixed(2)}).`;
        return;
      }
    }
  }

  submitBtn.disabled = true;
  try {
    const rate = await getRate(currency, state.baseCurrency, spentOn);
    const amountBase = roundToCents(amount * rate);
    const shares = shareAssignments.map((s) => ({
      member_id: s.member_id,
      share_base: roundToCents(s.amount * rate),
    }));

    const expensePatch = {
      kind,
      title,
      amount,
      currency,
      spent_on: spentOn,
      paid_by: paidBy,
      rate_to_base: rate,
      amount_base: amountBase,
      note,
    };

    if (state.expenseId) {
      await updateExpense(state.expenseId, state.token, expensePatch);
      // Replace the whole share set rather than diffing it -- simpler,
      // and correct even when which members are included has changed.
      await deleteExpenseShares(state.expenseId, state.token);
      await addExpenseShares(state.expenseId, state.token, shares);
    } else {
      const created = await addExpense(state.groupId, state.token, expensePatch);
      try {
        await addExpenseShares(created.id, state.token, shares);
      } catch (shareErr) {
        // Don't leave an orphaned expense with no shares behind.
        await deleteExpense(created.id, state.token).catch(() => {});
        throw shareErr;
      }
    }

    location.hash = `#/g/${state.groupId}`;
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Something went wrong saving that. Try again.";
    submitBtn.disabled = false;
  }
}
