# Expense Split

A simple expense-splitting app for a friend group traveling across multiple
currencies. Plain HTML/CSS/JS (no build step, no framework), a Supabase
Postgres backend, and Frankfurter for currency conversion.

Live at: https://eunie0815-creator.github.io/expense-split/

## How it works

- **Groups** are per-trip, each with a base currency and a shared passcode.
- **Expenses** and **payments** (e.g. "Ellie paid 15 SGD for Eunwoo") are the
  same underlying data — see the comment at the top of `js/balances.js` for
  why that one formula covers both.
- **Access** is passcode + a per-browser token (`localStorage`), gated by
  Postgres Row Level Security — see `sql/03_rls.sql`.

## Project layout

```
index.html            entry point; view swapping happens inside #app
css/theme.css          shared design tokens, copied from the run-club site
css/app.css             layout specific to this app
js/db.js               every Supabase REST/RPC call, in one place
js/fx.js                Frankfurter exchange-rate lookups + caching
js/money.js             pure split/rounding math (no DOM, no network)
js/balances.js           pure balance + settle-up math
js/router.js            minimal hash router (#/g/<id>, #/g/<id>/add, ...)
js/views/                one file per screen
sql/                    run these three files, in order, in the Supabase SQL Editor
```

## Local development

No install step. From this folder:

```
node serve.js
```

Then open http://localhost:8000. (`python3 -m http.server` also works if
your Python is set up; `serve.js` exists because this Mac's Python was
blocked by an unaccepted Xcode license at the time this was built.)

## Deploying

See the deploy steps you were walked through — in short: push this repo to
GitHub, then enable GitHub Pages (Settings → Pages → Deploy from a branch →
`main` / `/ (root)`).

## Currencies

Only currencies Frankfurter actually supports are offered — see the comment
in `js/currencies.js`. Notably no VND.
