-- One-time setup: create a least-privilege role for the running application
-- to connect as. This role is NOT the table owner and is NOT a superuser, so
-- Postgres enforces Row-Level Security on it automatically (RLS is silently
-- bypassed for superusers and, without FORCE ROW LEVEL SECURITY, for table
-- owners — using a separate role sidesteps that footgun entirely).
--
-- Run this once against your database as the owner/admin role, AFTER running
-- migrations (`pnpm db:migrate`) so the tables already exist.
--
-- On Neon: create the role from the Neon console's "Roles" tab instead (it
-- generates and stores the password for you), then just run the GRANT
-- statements below against your database. On a self-hosted/local Postgres,
-- run the whole file including the CREATE ROLE line (edit the password first).

-- CREATE ROLE app_user LOGIN PASSWORD 'change-me-to-a-strong-password';

grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;

-- auth_lookup_parent() (migrations/0003_auth_lookup.sql) is the one
-- SECURITY DEFINER escape hatch through RLS — it's how the login Server
-- Action finds a parent by email before any session/RLS context exists.
-- app_user gets EXECUTE only, never broader access to the parents table.
grant execute on function auth_lookup_parent(text) to app_user;

-- Ensure tables/functions created by future migrations are covered automatically.
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_user;
alter default privileges in schema public
  grant usage, select on sequences to app_user;
alter default privileges in schema public
  grant execute on functions to app_user;
