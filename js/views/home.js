import { createGroup } from "../db.js";
import { listSavedGroups, saveGroup } from "../storage.js";
import { escapeHtml } from "../util.js";
import { CURRENCIES } from "../currencies.js";
import { contrastTextColor } from "../colors.js";

export function renderHome(mountEl) {
  const groups = listSavedGroups();

  mountEl.innerHTML = `
    <div class="stack">
      <div class="row-between">
        <h1 class="font-display" style="font-size: 1.75rem; margin: 0; color: var(--ocean);">
          Your Groups
        </h1>
        <button class="btn btn-primary" id="new-group-btn">+ New</button>
      </div>

      <div id="group-list" class="stack">
        ${groups.length ? groups.map(groupCardHtml).join("") : emptyStateHtml()}
      </div>

      ${createFormHtml()}

      ${memeThreadHtml()}
    </div>
  `;

  mountEl.querySelector("#new-group-btn").addEventListener("click", () => {
    mountEl.querySelector("#create-group-form").hidden = false;
    mountEl.querySelector("#new-group-btn").hidden = true;
    mountEl.querySelector("#new-group-name").focus();
  });

  wireCreateForm(mountEl);
}

function emptyStateHtml() {
  return `
    <p class="center-note">
      No groups yet. Create one, or open a link a friend shared with you.
    </p>
  `;
}

function groupCardHtml(g) {
  return `
    <a class="group-card" href="#/g/${g.id}">
      <div class="card">
        <div class="row-between">
          <div>
            <strong>${escapeHtml(g.name)}</strong>
            <div class="muted">base ${escapeHtml(g.baseCurrency)}</div>
          </div>
        </div>
      </div>
    </a>
  `;
}

function createFormHtml() {
  const options = CURRENCIES.map(
    (c) => `<option value="${c.code}"${c.code === "SGD" ? " selected" : ""}>${c.flag} ${c.code}</option>`
  ).join("");

  return `
    <div id="create-group-form" class="card stack" hidden>
      <div>
        <label for="new-group-name">Trip name</label>
        <input class="input-field" id="new-group-name" placeholder="e.g. Bali Trip" />
      </div>
      <div>
        <label for="new-group-currency">Base currency</label>
        <select class="input-field" id="new-group-currency">${options}</select>
      </div>
      <div>
        <label for="new-group-passcode">Passcode (share this with your friends)</label>
        <input class="input-field" id="new-group-passcode" autocomplete="off" />
      </div>
      <div>
        <label for="new-group-passcode-confirm">Confirm passcode</label>
        <input class="input-field" id="new-group-passcode-confirm" autocomplete="off" />
      </div>
      <p id="create-group-error" class="form-error"></p>
      <div class="row">
        <button class="btn btn-primary" id="create-group-submit" style="flex: 1;">
          Create Group
        </button>
        <button class="btn btn-ghost" id="create-group-cancel">Cancel</button>
      </div>
    </div>
  `;
}

function wireCreateForm(mountEl) {
  const form = mountEl.querySelector("#create-group-form");
  const newGroupBtn = mountEl.querySelector("#new-group-btn");
  const errorEl = form.querySelector("#create-group-error");
  const submitBtn = form.querySelector("#create-group-submit");

  form.querySelector("#create-group-cancel").addEventListener("click", () => {
    form.hidden = true;
    newGroupBtn.hidden = false;
    errorEl.textContent = "";
  });

  submitBtn.addEventListener("click", async () => {
    const name = form.querySelector("#new-group-name").value.trim();
    const currency = form.querySelector("#new-group-currency").value;
    const passcode = form.querySelector("#new-group-passcode").value;
    const confirmPasscode = form.querySelector("#new-group-passcode-confirm").value;
    errorEl.textContent = "";

    if (!name) {
      errorEl.textContent = "Give the trip a name.";
      return;
    }
    if (passcode.length < 4) {
      errorEl.textContent = "Passcode should be at least 4 characters.";
      return;
    }
    if (passcode !== confirmPasscode) {
      errorEl.textContent = "Passcodes don't match.";
      return;
    }

    submitBtn.disabled = true;
    try {
      const { id, access_token } = await createGroup(name, currency, passcode);
      saveGroup({ id, name, baseCurrency: currency, token: access_token });
      location.hash = `#/g/${id}`;
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Something went wrong creating the group. Try again.";
      submitBtn.disabled = false;
    }
  });
}

// A running inside joke for this particular friend group -- not tied to
// any group's real member data, just decoration. Colors are picked from
// the same palette members can choose in js/colors.js, for a family
// resemblance with the rest of the app, but these four are hardcoded.
const MEME_LINES = [
  { name: "ellie", text: "but hes rich 💰", color: "F6DE8D", side: "end" },
  { name: "lucy", text: "but hes tall 🗼", color: "D98E8A", side: "start" },
  { name: "phoebe", text: "but hes funny 😂", color: "A8C3A0", side: "end" },
  { name: "sodam", text: "but he's an introvert 🪩", color: "8FAFC4", side: "start" },
];

function memeThreadHtml() {
  const bubbles = MEME_LINES.map(
    (line) => `
      <div class="chat-bubble chat-bubble--${line.side}"
           style="background:#${line.color}; color:${contrastTextColor(line.color)};">
        <strong>${escapeHtml(line.name)}</strong>: ${line.text}
      </div>
    `
  ).join("");

  return `
    <div class="card chat-thread">
      <div class="chat-thread__header">restrictions &#128680;</div>
      <div class="chat-thread__bubbles">${bubbles}</div>
    </div>
  `;
}
