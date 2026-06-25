-- Rate limiting table for AI API endpoints
-- Each row represents one API call; counts within a 24h window enforce daily limits.

CREATE TABLE IF NOT EXISTS api_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  workspace_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_endpoint_date
  ON api_usage(user_id, endpoint, created_at);

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Users can only read their own usage rows (needed for client-side "X remaining" displays)
CREATE POLICY "users_read_own_usage" ON api_usage
  FOR SELECT USING (user_id = auth.uid());

-- Server-side inserts use the service-role key, which bypasses RLS
