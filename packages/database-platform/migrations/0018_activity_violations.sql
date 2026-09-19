ALTER TABLE activity_attempts
  MODIFY COLUMN status ENUM('in_progress', 'passed', 'zeroed_violation') NOT NULL DEFAULT 'in_progress',
  ADD COLUMN violation_count SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER status;

CREATE TABLE activity_violations (
  id CHAR(36) PRIMARY KEY, attempt_id CHAR(36) NOT NULL,
  kind ENUM('tab_switch', 'fullscreen_exit') NOT NULL,
  occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY activity_violations_attempt_idx (attempt_id),
  CONSTRAINT activity_violations_attempt_fk FOREIGN KEY (attempt_id) REFERENCES activity_attempts(id) ON DELETE RESTRICT
);
