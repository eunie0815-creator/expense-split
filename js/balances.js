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
