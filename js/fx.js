// Currency conversion via Frankfurter (api.frankfurter.dev), a free
// exchange-rate API backed by the European Central Bank's daily
// reference rates -- no API key needed. Rates are looked up once per
// (date, from, to) and then cached: first in memory for this page
// load, then in the shared fx_rates table so every group benefits from
// a rate someone already fetched.
//
// A weekend/holiday date isn't an error: Frankfurter just returns the
// most recent business day's rate, which is what "the rate that day"
// actually means in practice.
//
// The public API has occasionally been slow/flaky in testing (Cloudflare
// 520/522s), so fetches retry a couple of times before giving up.

import { getCachedRate, cacheRate } from "./db.js";

const FRANKFURTER_URL = "https://api.frankfurter.dev/v1";
const memoryCache = new Map();

// Returns the multiplier such that `amountIn(from) * rate === amountIn(to)`.
export async function getRate(fromCurrency, toCurrency, date) {
  if (fromCurrency === toCurrency) return 1;

  const key = `${date}|${fromCurrency}|${toCurrency}`;
  if (memoryCache.has(key)) return memoryCache.get(key);

  const cached = await getCachedRate(date, fromCurrency, toCurrency);
  if (cached != null) {
    memoryCache.set(key, cached);
    return cached;
  }

  const rate = await fetchWithRetry(fromCurrency, toCurrency, date);
  memoryCache.set(key, rate);

  // Best-effort write-back to the shared cache; a failure here (e.g. a
  // race with another tab) shouldn't break the expense the user is saving.
  cacheRate(date, fromCurrency, toCurrency, rate).catch((err) => {
    console.warn("fx cache write failed (non-fatal):", err);
  });

  return rate;
}

async function fetchWithRetry(from, to, date, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchRate(from, to, date);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(400 * (i + 1));
    }
  }
  throw lastErr;
}

async function fetchRate(from, to, date) {
  const url = `${FRANKFURTER_URL}/${date}?base=${from}&symbols=${to}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Frankfurter request failed (${res.status})`);

  const data = await res.json();
  const rate = data.rates?.[to];
  if (typeof rate !== "number") {
    throw new Error(`No rate for ${from} -> ${to} on ${date}`);
  }
  return rate;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
