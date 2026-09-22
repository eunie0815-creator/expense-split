-- Run this in the Supabase SQL Editor after the first three files.
--
-- Lets each member pick a personal color (from a fixed palette) so
-- they're easy to tell apart in the member list, expense rows, and
-- settle-up suggestions. No RLS change needed -- members_rw (03_rls.sql)
-- already covers every column on this table.

alter table members
  add column color char(6)
  check (color in ('F6DE8D', 'D98E8A', 'B8A9C9', '5B3A55', 'A8C3A0', '8FAFC4', 'A0522D'));
