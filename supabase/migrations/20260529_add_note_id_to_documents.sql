-- Add note_id FK so documents can be attached to a note
alter table documents add column if not exists note_id uuid references notes(id) on delete cascade;
