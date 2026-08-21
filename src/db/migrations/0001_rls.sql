-- Row-Level Security: enforced at the database layer so that even a bug in
-- application-level WHERE clauses cannot leak one family's data to another.
--
-- Every parent-scoped query MUST run inside `withParentContext()` (see
-- src/db/index.ts), which sets the `app.current_parent_id` session variable
-- for the duration of a transaction. Policies below key off that variable.
-- A connection that never sets it (current_setting(..., true) returns NULL)
-- is denied by every policy — fail closed, not fail open.

create or replace function app_current_parent_id() returns uuid as $$
  select nullif(current_setting('app.current_parent_id', true), '')::uuid
$$ language sql stable;

-- ---------------------------------------------------------------------------
-- parents: a parent can only see/edit their own row.
-- ---------------------------------------------------------------------------
alter table parents enable row level security;
alter table parents force row level security;

create policy parents_self on parents
  for all
  using (id = app_current_parent_id())
  with check (id = app_current_parent_id());

-- ---------------------------------------------------------------------------
-- children: owned directly by parent_id.
-- ---------------------------------------------------------------------------
alter table children enable row level security;
alter table children force row level security;

create policy children_owner on children
  for all
  using (parent_id = app_current_parent_id())
  with check (parent_id = app_current_parent_id());

-- ---------------------------------------------------------------------------
-- math_items / reading_passages: NULL parent_id = shared seed content,
-- readable by everyone but not writable by parents (only the seed script,
-- which connects without RLS context, can touch those rows). Non-null
-- parent_id rows are private to that family.
-- ---------------------------------------------------------------------------
alter table math_items enable row level security;
alter table math_items force row level security;

create policy math_items_read on math_items
  for select
  using (parent_id is null or parent_id = app_current_parent_id());

create policy math_items_write on math_items
  for insert
  with check (parent_id = app_current_parent_id());

create policy math_items_modify on math_items
  for update
  using (parent_id = app_current_parent_id())
  with check (parent_id = app_current_parent_id());

create policy math_items_delete on math_items
  for delete
  using (parent_id = app_current_parent_id());

alter table reading_passages enable row level security;
alter table reading_passages force row level security;

create policy reading_passages_read on reading_passages
  for select
  using (parent_id is null or parent_id = app_current_parent_id());

create policy reading_passages_write on reading_passages
  for insert
  with check (parent_id = app_current_parent_id());

create policy reading_passages_modify on reading_passages
  for update
  using (parent_id = app_current_parent_id())
  with check (parent_id = app_current_parent_id());

create policy reading_passages_delete on reading_passages
  for delete
  using (parent_id = app_current_parent_id());

-- ---------------------------------------------------------------------------
-- Child-scoped tables: ownership determined by joining to children.parent_id.
-- ---------------------------------------------------------------------------
alter table domain_mastery enable row level security;
alter table domain_mastery force row level security;

create policy domain_mastery_owner on domain_mastery
  for all
  using (exists (select 1 from children c where c.id = domain_mastery.child_id and c.parent_id = app_current_parent_id()))
  with check (exists (select 1 from children c where c.id = domain_mastery.child_id and c.parent_id = app_current_parent_id()));

alter table assignments enable row level security;
alter table assignments force row level security;

create policy assignments_owner on assignments
  for all
  using (exists (select 1 from children c where c.id = assignments.child_id and c.parent_id = app_current_parent_id()))
  with check (exists (select 1 from children c where c.id = assignments.child_id and c.parent_id = app_current_parent_id()));

alter table reward_settings enable row level security;
alter table reward_settings force row level security;

create policy reward_settings_owner on reward_settings
  for all
  using (parent_id = app_current_parent_id())
  with check (parent_id = app_current_parent_id());

alter table reward_events enable row level security;
alter table reward_events force row level security;

create policy reward_events_owner on reward_events
  for all
  using (exists (select 1 from children c where c.id = reward_events.child_id and c.parent_id = app_current_parent_id()))
  with check (exists (select 1 from children c where c.id = reward_events.child_id and c.parent_id = app_current_parent_id()));

alter table session_log enable row level security;
alter table session_log force row level security;

create policy session_log_owner on session_log
  for all
  using (exists (select 1 from children c where c.id = session_log.child_id and c.parent_id = app_current_parent_id()))
  with check (exists (select 1 from children c where c.id = session_log.child_id and c.parent_id = app_current_parent_id()));

alter table writing_evaluations enable row level security;
alter table writing_evaluations force row level security;

create policy writing_evaluations_owner on writing_evaluations
  for all
  using (exists (select 1 from children c where c.id = writing_evaluations.child_id and c.parent_id = app_current_parent_id()))
  with check (exists (select 1 from children c where c.id = writing_evaluations.child_id and c.parent_id = app_current_parent_id()));
