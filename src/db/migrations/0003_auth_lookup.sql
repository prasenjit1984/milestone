-- Row-Level Security makes the login flow's own first query impossible by
-- construction: `withParentContext()` needs a parentId to set the RLS
-- context, but at login time all we have is an email — there's no parentId
-- yet to set, so a plain `select ... from parents where email = ...` as
-- app_user always returns zero rows (parents_self requires id =
-- app_current_parent_id(), which is NULL with no context set). Fail-closed
-- RLS is doing exactly its job here; we just need one narrow, explicit way
-- through it for the credential check itself.
--
-- The standard fix: a SECURITY DEFINER function. It runs with the
-- privileges of whoever owns it (the migrations/superuser role), which
-- bypasses RLS for exactly the columns this function returns — not the
-- whole parents table — and app_user is only ever granted EXECUTE on it,
-- never broader SELECT access. Every other column (parent_pin_hash,
-- created_at, etc.) stays unreachable through this path.
create or replace function auth_lookup_parent(p_email text)
returns table (id uuid, password_hash text)
language sql
stable
security definer
set search_path = public
as $$
  select id, password_hash from parents where email = p_email
$$;

-- Ordinary users should never call this directly.
revoke all on function auth_lookup_parent(text) from public;

-- Guarded: in a fresh environment, migrations run BEFORE setup-app-role.sql
-- creates the app_user role (see that file's header comment), so this grant
-- would otherwise fail with "role app_user does not exist". setup-app-role.sql
-- grants EXECUTE on this function explicitly too, so this is redundant (and a
-- no-op) whenever app_user already exists — e.g. on a `pnpm db:migrate` run
-- against an already-provisioned database.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant execute on function auth_lookup_parent(text) to app_user;
  end if;
end
$$;
