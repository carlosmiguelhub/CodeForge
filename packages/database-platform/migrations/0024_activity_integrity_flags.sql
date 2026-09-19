CREATE TABLE activity_integrity_flags (
  id CHAR(36) PRIMARY KEY,
  attempt_id CHAR(36) NOT NULL,
  kind ENUM('input_ignored', 'output_invariant') NOT NULL,
  test_case_id CHAR(36) NULL,
  message TEXT NOT NULL,
  detected_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY activity_integrity_flags_attempt_idx (attempt_id),
  CONSTRAINT activity_integrity_flags_attempt_fk FOREIGN KEY (attempt_id) REFERENCES activity_attempts(id) ON DELETE RESTRICT,
  CONSTRAINT activity_integrity_flags_test_case_fk FOREIGN KEY (test_case_id) REFERENCES activity_test_cases(id) ON DELETE RESTRICT
);
