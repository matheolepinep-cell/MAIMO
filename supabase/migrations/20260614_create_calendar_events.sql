-- À exécuter dans le SQL Editor Supabase

CREATE TABLE IF NOT EXISTS calendar_events (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id     uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id       uuid REFERENCES accounts(id) ON DELETE SET NULL,
  google_event_id  text,
  title            text NOT NULL,
  description      text,
  start_time       timestamptz NOT NULL,
  end_time         timestamptz NOT NULL,
  location         text,
  attendees        jsonb DEFAULT '[]',
  synced_from      text DEFAULT 'google',
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user ON calendar_events(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_company ON calendar_events(company_id);
