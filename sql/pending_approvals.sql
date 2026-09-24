CREATE TABLE IF NOT EXISTS pending_approvals (
    id BIGSERIAL PRIMARY KEY,
    persona TEXT NOT NULL DEFAULT 'wendy',
    tool TEXT NOT NULL,
    args JSONB NOT NULL,
    trace JSONB NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pending_approvals_status_idx
    ON pending_approvals (status, created_at DESC);
