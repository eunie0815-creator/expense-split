-- Run this third.
--
-- Access model: the anon key is public (it's committed to the repo), so
-- every table is locked down with Row Level Security. A row is only
-- visible/writable if the request's x-group-token header matches that
-- row's group's access_token -- see header_token() in 02_functions.sql.
-- The token is only ever handed out by unlock_group(), which checks the
-- passcode first. Direct table access without the right header returns
-- zero rows, by default.

alter table groups         enable row level security;
alter table members        enable row level security;
alter table expenses       enable row level security;
alter table expense_shares enable row level security;
alter table fx_rates       enable row level security;

-- Table-level grants. "Automatically expose new tables" was left off when
-- the project was created, so nothing is reachable from the API until we
-- grant it explicitly here -- RLS is then the row-level gate on top.
grant usage on schema public to anon, authenticated;

grant execute on function header_token() to anon, authenticated;
grant execute on function create_group(text, text, text) to anon, authenticated;
grant execute on function unlock_group(uuid, text) to anon, authenticated;

-- groups: no insert/delete grant at all -- creation only happens through
-- create_group(), which runs as security definer and bypasses this.
grant select, update on groups to anon, authenticated;

grant select, insert, update, delete on members        to anon, authenticated;
grant select, insert, update, delete on expenses        to anon, authenticated;
grant select, insert, update, delete on expense_shares  to anon, authenticated;

-- fx_rates is a shared, non-sensitive cache: readable by anyone, and
-- appendable (never updated/deleted) so the cache only grows.
grant select, insert on fx_rates to anon, authenticated;

-- groups: readable/updatable only once you hold that group's token.
create policy groups_select on groups
  for select
  using (access_token = header_token());

create policy groups_update on groups
  for update
  using (access_token = header_token())
  with check (access_token = header_token());

-- members: full CRUD, gated by the parent group's token.
create policy members_rw on members
  for all
  using (exists (
    select 1 from groups g
    where g.id = members.group_id and g.access_token = header_token()
  ))
  with check (exists (
    select 1 from groups g
    where g.id = members.group_id and g.access_token = header_token()
  ));

-- expenses: same pattern.
create policy expenses_rw on expenses
  for all
  using (exists (
    select 1 from groups g
    where g.id = expenses.group_id and g.access_token = header_token()
  ))
  with check (exists (
    select 1 from groups g
    where g.id = expenses.group_id and g.access_token = header_token()
  ));

-- expense_shares: gated via its parent expense's group.
create policy expense_shares_rw on expense_shares
  for all
  using (exists (
    select 1 from expenses e
    join groups g on g.id = e.group_id
    where e.id = expense_shares.expense_id and g.access_token = header_token()
  ))
  with check (exists (
    select 1 from expenses e
    join groups g on g.id = e.group_id
    where e.id = expense_shares.expense_id and g.access_token = header_token()
  ));

-- fx_rates: world-readable and world-insertable (no update/delete policy,
-- so once a rate is cached for a date it can't be overwritten).
create policy fx_rates_select on fx_rates
  for select
  using (true);

create policy fx_rates_insert on fx_rates
  for insert
  with check (true);
