CREATE TABLE IF NOT EXISTS findings (
    id BIGSERIAL PRIMARY KEY,
    persona TEXT NOT NULL,
    source_url TEXT,
    title TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    asked TEXT,
    found TEXT,
    published TEXT
);

CREATE INDEX IF NOT EXISTS findings_persona_created_idx
    ON findings (persona, created_at DESC);
