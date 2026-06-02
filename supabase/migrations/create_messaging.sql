-- Messaging tables
-- À exécuter dans Supabase SQL Editor

CREATE TABLE IF NOT EXISTS conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  participants uuid[] NOT NULL,
  last_message text,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  content text,
  file_path text,
  file_name text,
  file_type text,
  created_at timestamptz DEFAULT now(),
  read_by uuid[] DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_participants ON conversations USING gin(participants);
