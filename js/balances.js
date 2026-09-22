// Pure math -- no DOM, no network. Takes what's already in the database
// (expenses + expense_shares, both already in the group's base currency)
// and answers "who owes whom".
//
// balance(member) = (everything they paid) - (every share assigned to them)
//
// Positive = owed money by the group (a creditor). Negative = owes the
// group (a debtor). A "payment" row (Ellie paid 15 SGD for Eunwoo) uses
// this exact same formula: it credits Ellie (paid_by) and debits Eunwoo
// (the one share), which is exactly a partial repayment of whatever
// Eunwoo already owed -- no separate settlement logic needed.

import { roundToCents } from "./money.js";

export function computeBalances(members, expenses, shares) {
  const balanceByMember = new Map(members.map((m) => [m.id, 0]));

  for (const e of expenses) {
    const prev = balanceByMember.get(e.paid_by) ?? 0;
    balanceByMember.set(e.paid_by, prev + Number(e.amount_base));
  }

  for (const s of shares) {
    const prev = balanceByMember.get(s.member_id) ?? 0;
    balanceByMember.set(s.member_id, prev - Number(s.share_base));
  }

  return members.map((m) => ({
    id: m.id,
    name: m.name,
    balance: roundToCents(balanceByMember.get(m.id) ?? 0),
  }));
}

// Greedy min-cash-flow: repeatedly match the biggest creditor with the
// biggest debtor. Not always the mathematically fewest possible payments
// in every edge case, but for a handful of people it's optimal in
// practice and simple enough to read.
export function settleUp(balances) {
  const creditors = balances
    .filter((b) => b.balance > 0.001)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.balance - a.balance);
  const debtors = balances
    .filter((b) => b.balance < -0.001)
    .map((b) => ({ ...b, balance: -b.balance }))
    .sort((a, b) => b.balance - a.balance);

  const payments = [];
  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i];
    const debtor = debtors[j];
    const amount = roundToCents(Math.min(creditor.balance, debtor.balance));

    if (amount > 0) {
      payments.push({
        from: debtor.name,
        to: creditor.name,
        fromId: debtor.id,
        toId: creditor.id,
        amount,
      });
    }

    creditor.balance = roundToCents(creditor.balance - amount);
    debtor.balance = roundToCents(debtor.balance - amount);

    if (creditor.balance <= 0.001) i++;
    if (debtor.balance <= 0.001) j++;
  }

  return payments;
}

// The "unsimplified" alternative to settleUp(): every expense/payment
// creates a direct debt from each non-payer participant to that
// expense's payer -- a payment is just an expense with one participant
// sharing the whole amount, so the same rule covers both (see the file
// comment above). Two people's debts to each other net against each
// other, but debts aren't rerouted through a third person the way
// settleUp()'s min-cash-flow simplification does, so e.g. Sodam still
// pays Ellie directly even if that could be routed through a third
// person instead.
export function computePairwiseDebts(members, expenses, shares) {
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  const sharesByExpense = new Map();
  for (const s of shares) {
    const list = sharesByExpense.get(s.expense_id);
    if (list) list.push(s);
    else sharesByExpense.set(s.expense_id, [s]);
  }

  // net.get("a|b") (a < b by id) = how much b owes a, minus how much a
  // owes b. A single signed number per pair is enough since only the
  // final net between two people is ever shown.
  const net = new Map();
  const addDebt = (owerId, owedToId, amount) => {
    if (owerId === owedToId || !amount) return;
    const [a, b] = owerId < owedToId ? [owerId, owedToId] : [owedToId, owerId];
    const sign = owerId === a ? -1 : 1;
    const key = `${a}|${b}`;
    net.set(key, (net.get(key) ?? 0) + sign * amount);
  };

  for (const e of expenses) {
    for (const s of sharesByExpense.get(e.id) ?? []) {
      if (s.member_id === e.paid_by) continue;
      addDebt(s.member_id, e.paid_by, Number(s.share_base));
    }
  }

  const debts = [];
  for (const [key, rawAmount] of net) {
    const amount = roundToCents(rawAmount);
    if (Math.abs(amount) < 0.01) continue;
    const [a, b] = key.split("|");
    const [fromId, toId] = amount > 0 ? [b, a] : [a, b];
    debts.push({
      fromId,
      toId,
      from: nameById.get(fromId) ?? "Unknown",
      to: nameById.get(toId) ?? "Unknown",
      amount: Math.abs(amount),
    });
  }

  return debts.sort((x, y) => y.amount - x.amount);
}
