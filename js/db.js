// All Supabase access goes through here: plain fetch calls to the REST
// API and RPC endpoints (no client library -- one less thing to learn,
// and it's exactly what we already verified works with curl). Every
// call after unlocking a group sends that group's access_token as the
// x-group-token header; Row Level Security (see sql/03_rls.sql) uses it
// to decide what's visible.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const REST_URL = `${SUPABASE_URL}/rest/v1`;

async function request(path, { method = "GET", token, body, prefer } = {}) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
  if (token) headers["x-group-token"] = token;
  if (prefer) headers["Prefer"] = prefer;

  const res = await fetch(`${REST_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${path} failed (${res.status}): ${text}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// --- groups ---

// Creates a group and returns { id, access_token }. There is no direct
// INSERT grant on the groups table -- this RPC (security definer) is the
// only way a group gets created. See sql/02_functions.sql.
export async function createGroup(name, baseCurrency, passcode) {
  const [row] = await request("/rpc/create_group", {
    method: "POST",
    body: { p_name: name, p_base_currency: baseCurrency, p_passcode: passcode },
  });
  return row;
}

// Returns the group's access_token on a correct passcode, or null.
export async function unlockGroup(groupId, passcode) {
  return request("/rpc/unlock_group", {
    method: "POST",
    body: { p_group_id: groupId, p_passcode: passcode },
  });
}

export async function getGroup(groupId, token) {
  const rows = await request(
    `/groups?id=eq.${groupId}&select=id,name,base_currency,created_at`,
    { token }
  );
  return rows[0] ?? null;
}

export async function updateGroupName(groupId, token, name) {
  const [row] = await request(`/groups?id=eq.${groupId}`, {
    method: "PATCH",
    token,
    prefer: "return=representation",
    body: { name },
  });
  return row;
}

// --- members ---

export async function listMembers(groupId, token) {
  return request(`/members?group_id=eq.${groupId}&select=id,name&order=name.asc`, { token });
}

export async function addMember(groupId, token, name) {
  const [row] = await request("/members", {
    method: "POST",
    token,
    prefer: "return=representation",
    body: { group_id: groupId, name },
  });
  return row;
}

export async function updateMemberName(memberId, token, name) {
  const [row] = await request(`/members?id=eq.${memberId}`, {
    method: "PATCH",
    token,
    prefer: "return=representation",
    body: { name },
  });
  return row;
}

export async function deleteMember(memberId, token) {
  // Fails with a foreign key error if this member has expenses -- that's
  // intentional; there's no "reassign their expenses" flow yet.
  await request(`/members?id=eq.${memberId}`, { method: "DELETE", token });
}

// --- expenses ---
// A "payment" (e.g. "Ellie paid 15 SGD for Eunwoo") is stored exactly
// like a normal expense -- same table, just kind='payment' and a single
// share. See balances.js for why one formula covers both.

export async function listExpenses(groupId, token) {
  return request(
    `/expenses?group_id=eq.${groupId}&select=id,kind,title,amount,currency,spent_on,paid_by,amount_base,note&order=spent_on.desc,created_at.desc`,
    { token }
  );
}

// expense: { kind, title, amount, currency, spent_on, paid_by, rate_to_base, amount_base, note }
export async function addExpense(groupId, token, expense) {
  const [row] = await request("/expenses", {
    method: "POST",
    token,
    prefer: "return=representation",
    body: { group_id: groupId, ...expense },
  });
  return row;
}

// shares: [{ member_id, share_base }]
export async function addExpenseShares(expenseId, token, shares) {
  const rows = shares.map((s) => ({ expense_id: expenseId, ...s }));
  return request("/expense_shares", {
    method: "POST",
    token,
    prefer: "return=representation",
    body: rows,
  });
}

export async function getExpense(expenseId, token) {
  const rows = await request(
    `/expenses?id=eq.${expenseId}&select=id,kind,title,amount,currency,spent_on,paid_by,rate_to_base,amount_base,note`,
    { token }
  );
  return rows[0] ?? null;
}

// patch: any subset of the addExpense() fields.
export async function updateExpense(expenseId, token, patch) {
  const [row] = await request(`/expenses?id=eq.${expenseId}`, {
    method: "PATCH",
    token,
    prefer: "return=representation",
    body: { ...patch, updated_at: new Date().toISOString() },
  });
  return row;
}

export async function deleteExpense(expenseId, token) {
  await request(`/expenses?id=eq.${expenseId}`, { method: "DELETE", token });
}

// Used when editing an expense: the old shares are replaced wholesale
// rather than diffed, since the set of members and amounts can both
// change at once -- simpler and just as correct for this app's size.
export async function deleteExpenseShares(expenseId, token) {
  await request(`/expense_shares?expense_id=eq.${expenseId}`, { method: "DELETE", token });
}

// All shares across a set of expenses (used to compute balances). Filters
// by expense_id rather than group_id, since expense_shares has no
// group_id column of its own -- the caller already has the expense list.
export async function listExpenseShares(expenseIds, token) {
  if (expenseIds.length === 0) return [];
  const idList = expenseIds.join(",");
  return request(
    `/expense_shares?expense_id=in.(${idList})&select=member_id,share_base`,
    { token }
  );
}

// --- fx rate cache (shared across all groups, no token needed -- see the
// fx_rates policies in sql/03_rls.sql, which allow anyone to read/insert
// but never update or delete) ---

export async function getCachedRate(asOf, base, quote) {
  const rows = await request(
    `/fx_rates?as_of=eq.${asOf}&base=eq.${base}&quote=eq.${quote}&select=rate`
  );
  return rows[0] ? Number(rows[0].rate) : null;
}

export async function cacheRate(asOf, base, quote, rate) {
  // ignore-duplicates: if another tab already cached this exact rate
  // between our read and write, silently keep the existing row instead
  // of erroring on the primary key.
  await request("/fx_rates", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: { as_of: asOf, base, quote, rate },
  });
}
