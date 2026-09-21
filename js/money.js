// Pure money math -- no DOM, no network. Every amount in this app is
// stored with 2 decimal places (numeric(14,2) in Postgres), regardless
// of currency, so KRW/IDR/JPY are shown with cents too. That's a
// deliberate simplification for a small friend-group tool, not a
// general payments platform.

export function toCents(amount) {
  return Math.round(amount * 100);
}

export function fromCents(cents) {
  return cents / 100;
}

export function roundToCents(amount) {
  return fromCents(toCents(amount));
}

// Splits `totalAmount` into `count` shares (2dp) that always sum back to
// exactly totalAmount -- any leftover cent(s) from the division go to
// the first entries, so the split is deterministic given the same
// (amount, count) input.
export function splitEqually(totalAmount, count) {
  const totalCents = toCents(totalAmount);
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;

  const cents = Array(count).fill(base);
  for (let i = 0; i < remainder; i++) cents[i] += 1;

  return cents.map(fromCents);
}

export function sumAmounts(amounts) {
  return fromCents(amounts.reduce((sum, a) => sum + toCents(a), 0));
}

export function formatMoney(amount, currency) {
  return `${currency} ${amount.toFixed(2)}`;
}
