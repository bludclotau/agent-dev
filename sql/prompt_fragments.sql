CREATE TABLE IF NOT EXISTS prompt_fragments (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('coarse', 'fine')),
    tags TEXT[] NOT NULL DEFAULT '{}',
    tools TEXT[] NOT NULL DEFAULT '{}',
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
