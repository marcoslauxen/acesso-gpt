CREATE TABLE app_users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(320) NOT NULL,
  normalized_name VARCHAR(100) NOT NULL UNIQUE,
  normalized_email VARCHAR(320) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE code_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'sent', 'expired', 'canceled', 'failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > requested_at)
);

CREATE UNIQUE INDEX one_waiting_code_request
  ON code_requests ((TRUE))
  WHERE status = 'waiting';

CREATE INDEX code_requests_user_id_idx ON code_requests (user_id);
CREATE INDEX code_requests_status_idx ON code_requests (status);

CREATE TABLE delivery_history (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT NOT NULL UNIQUE REFERENCES code_requests(id),
  user_id BIGINT NOT NULL REFERENCES app_users(id),
  recipient_email VARCHAR(320) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'failed')),
  detail TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX delivery_history_user_id_idx ON delivery_history (user_id);
