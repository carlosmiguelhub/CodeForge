ALTER TABLE workspace_allocations
  ADD COLUMN cleanup_state ENUM('active','pending','cleaning','complete','failed') NOT NULL DEFAULT 'active' AFTER released_at,
  ADD COLUMN cleanup_attempts INT NOT NULL DEFAULT 0 AFTER cleanup_state,
  ADD COLUMN cleanup_error VARCHAR(80) NULL AFTER cleanup_attempts,
  ADD INDEX workspace_allocations_cleanup_idx (cleanup_state, cleanup_attempts);
