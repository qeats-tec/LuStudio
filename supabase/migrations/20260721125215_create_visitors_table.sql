/*
# Create visitors table for site-wide visitor counter

1. New Tables
- `visitors`
  - `id` (uuid, primary key)
  - `visitor_fingerprint` (text, unique) — a browser-localStorage-generated unique id used to deduplicate visits
  - `created_at` (timestamptz, default now())
  - `last_seen` (timestamptz, default now()) — updated on repeat visits
2. Security
- Enable RLS on `visitors`.
- Allow anon + authenticated INSERT (so new visitors can register themselves).
- Allow anon + authenticated SELECT (so the counter can be displayed publicly).
- Allow anon + authenticated UPDATE on last_seen (so repeat visits refresh the timestamp).
3. Notes
- Single-tenant, no-auth app: the visitor counter is intentionally public/shared.
- The frontend generates a UUID per browser via localStorage and sends it to this table.
- Duplicate inserts are prevented by the unique constraint on visitor_fingerprint; the frontend uses upsert to handle repeats.
*/

CREATE TABLE IF NOT EXISTS visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_fingerprint text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now()
);

ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_visitors" ON visitors;
CREATE POLICY "anon_select_visitors" ON visitors FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_visitors" ON visitors;
CREATE POLICY "anon_insert_visitors" ON visitors FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_visitors" ON visitors;
CREATE POLICY "anon_update_visitors" ON visitors FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- Index for fast count queries
CREATE INDEX IF NOT EXISTS visitors_created_at_idx ON visitors (created_at);
