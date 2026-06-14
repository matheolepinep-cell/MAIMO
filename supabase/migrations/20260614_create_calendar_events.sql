-- Migration : table calendar_events
-- À exécuter dans le SQL Editor Supabase

CREATE TABLE IF NOT EXISTS calendar_events (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id     uuid,
  google_event_id  text,
  title            text NOT NULL,
  description      text,
  start_time       timestamptz NOT NULL,
  end_time         timestamptz NOT NULL,
  location         text,
  attendees        jsonb DEFAULT '[]',
  company_id       uuid,
  synced_from      text DEFAULT 'google',
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS calendar_events_user_id_start_time_idx
  ON calendar_events (user_id, start_time);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_google_event_id_user_id_idx
  ON calendar_events (google_event_id, user_id)
  WHERE google_event_id IS NOT NULL;

-- RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own calendar events"
  ON calendar_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own calendar events"
  ON calendar_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own calendar events"
  ON calendar_events FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own calendar events"
  ON calendar_events FOR DELETE
  USING (auth.uid() = user_id);
