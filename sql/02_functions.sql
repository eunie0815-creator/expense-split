-- Run this second.
--
-- header_token(): reads the "x-group-token" header the browser sends on
-- every request, for use inside RLS policies (03_rls.sql). Returns '' when
-- absent, which never matches a real access_token, so the default is
-- always deny.
create or replace function header_token()
returns text
language sql
stable
as $$
  select coalesce(
    current_setting('request.headers', true)::json ->> 'x-group-token',
    ''
  );
$$;

-- create_group(): the only way a 'groups' row gets created. Runs as
-- security definer so it can write to the table even though anon has no
-- direct INSERT grant on it. Hashes the passcode with bcrypt (never
-- stores it in plain text) and returns a fresh random access_token that
-- the app saves in localStorage for every request after this point.
create or replace function create_group(p_name text, p_base_currency text, p_passcode text)
returns table (id uuid, access_token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id    uuid;
  v_token text := encode(gen_random_bytes(18), 'hex');
begin
  insert into groups (name, base_currency, passcode_hash, access_token)
  values (p_name, upper(p_base_currency), crypt(p_passcode, gen_salt('bf')), v_token)
  returning groups.id into v_id;

  return query select v_id, v_token;
end;
$$;

-- unlock_group(): checks a passcode against the stored bcrypt hash and,
-- on success, returns that group's access_token. Returns null on any
-- failure (wrong passcode or unknown group id) -- the app treats both
-- the same way, so it never reveals whether a group id exists.
create or replace function unlock_group(p_group_id uuid, p_passcode text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash  text;
  v_token text;
begin
  select passcode_hash, access_token into v_hash, v_token
  from groups where id = p_group_id;

  if v_hash is null then
    return null;
  end if;

  if crypt(p_passcode, v_hash) = v_hash then
    return v_token;
  end if;

  return null;
end;
$$;
