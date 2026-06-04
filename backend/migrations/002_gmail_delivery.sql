ALTER TABLE code_requests
  DROP CONSTRAINT code_requests_status_check;

ALTER TABLE code_requests
  ADD CONSTRAINT code_requests_status_check
  CHECK (status IN ('waiting', 'processing', 'sent', 'expired', 'canceled', 'failed'));

ALTER TABLE code_requests
  ADD COLUMN source_message_id TEXT;

DROP INDEX one_waiting_code_request;

CREATE UNIQUE INDEX one_active_code_request
  ON code_requests ((TRUE))
  WHERE status IN ('waiting', 'processing');

CREATE UNIQUE INDEX unique_source_message_id
  ON code_requests (source_message_id)
  WHERE source_message_id IS NOT NULL;
