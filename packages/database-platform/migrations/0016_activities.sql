CREATE TABLE activities (
  id CHAR(36) PRIMARY KEY, class_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL, instructions TEXT NOT NULL,
  language ENUM('python', 'java', 'cpp', 'javascript', 'c') NOT NULL,
  starter_code TEXT NULL,
  allow_retake TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY activities_class_idx (class_id),
  CONSTRAINT activities_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT
);

CREATE TABLE activity_test_cases (
  id CHAR(36) PRIMARY KEY, activity_id CHAR(36) NOT NULL,
  stdin TEXT NOT NULL, expected_stdout TEXT NOT NULL,
  order_index SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  KEY activity_test_cases_activity_idx (activity_id),
  CONSTRAINT activity_test_cases_activity_fk FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE RESTRICT
);

CREATE TABLE activity_attempts (
  id CHAR(36) PRIMARY KEY, activity_id CHAR(36) NOT NULL, student_id CHAR(36) NOT NULL,
  status ENUM('in_progress', 'passed') NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  submitted_at TIMESTAMP(3) NULL,
  UNIQUE KEY activity_attempts_activity_student_uq (activity_id, student_id),
  KEY activity_attempts_student_idx (student_id),
  CONSTRAINT activity_attempts_activity_fk FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE RESTRICT,
  CONSTRAINT activity_attempts_student_fk FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE activity_test_runs (
  id CHAR(36) PRIMARY KEY, attempt_id CHAR(36) NOT NULL, test_case_id CHAR(36) NOT NULL,
  passed TINYINT(1) NOT NULL, actual_stdout TEXT NULL,
  ran_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY activity_test_runs_attempt_idx (attempt_id),
  CONSTRAINT activity_test_runs_attempt_fk FOREIGN KEY (attempt_id) REFERENCES activity_attempts(id) ON DELETE RESTRICT,
  CONSTRAINT activity_test_runs_test_case_fk FOREIGN KEY (test_case_id) REFERENCES activity_test_cases(id) ON DELETE RESTRICT
);
