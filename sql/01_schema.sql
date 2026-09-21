-- Run this first in the Supabase SQL Editor.
-- Core tables. No 'settlements' table: a repayment ("Ellie paid 15 SGD
-- for Eunwoo") is stored as an expense row with kind='payment' and a
-- single share, so balances only ever need one formula (see balances.js).

create extension if not exists pgcrypto;

create table groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  base_currency char(3) not null,
  passcode_hash text not null,      -- bcrypt hash, set via create_group()
  access_token  text not null unique, -- sent as the x-group-token header after unlock
  created_at    timestamptz not null default now()
);

create table members (
  id       uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name     text not null,
  unique (group_id, name)
);

create table expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups(id) on delete cascade,
  kind         text not null default 'expense' check (kind in ('expense', 'payment')),
  title        text not null,
  amount       numeric(14, 2) not null check (amount > 0),
  currency     char(3) not null,
  spent_on     date not null,
  -- deferrable: lets `delete from groups` cascade cleanly (members and
  -- expenses are deleted in the same transaction, so by commit time this
  -- reference is gone too). A standalone `delete from members` outside
  -- that cascade still gets blocked, since nothing else deletes the
  -- referencing rows in that transaction -- see deleteMember() in db.js.
  paid_by      uuid not null references members(id) deferrable initially deferred,
  rate_to_base numeric(20, 10) not null,  -- frozen FX rate at entry time
  amount_base  numeric(14, 2) not null,   -- amount * rate_to_base, rounded
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table expense_shares (
  expense_id uuid not null references expenses(id) on delete cascade,
  member_id  uuid not null references members(id) deferrable initially deferred,
  share_base numeric(14, 2) not null,  -- this member's slice, in the group's base currency
  primary key (expense_id, member_id)
);

-- Shared FX rate cache (Frankfurter results), keyed by date + currency pair.
-- Not tied to any group; every group benefits from the shared cache.
create table fx_rates (
  as_of date not null,
  base  char(3) not null,
  quote char(3) not null,
  rate  numeric(20, 10) not null check (rate > 0),
  primary key (as_of, base, quote)
);

create index expenses_group_id_idx on expenses(group_id);
create index members_group_id_idx on members(group_id);
create index expense_shares_expense_id_idx on expense_shares(expense_id);
