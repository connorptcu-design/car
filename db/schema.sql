-- Run once against the D1 database bound as DB (Cloudflare dashboard -> D1 -> database -> Console).
CREATE TABLE IF NOT EXISTS tool_state (
  email      TEXT NOT NULL,
  tool       TEXT NOT NULL,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (email, tool)
);
