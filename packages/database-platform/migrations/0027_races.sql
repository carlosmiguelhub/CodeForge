CREATE TABLE races (
  id CHAR(36) PRIMARY KEY,
  class_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  opens_at TIMESTAMP(3) NOT NULL,
  closes_at TIMESTAMP(3) NOT NULL,
  status ENUM('draft', 'open', 'closed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY races_class_idx (class_id),
  KEY races_availability_idx (status, opens_at, closes_at),
  CONSTRAINT races_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT
);

CREATE TABLE race_problems (
  id CHAR(36) PRIMARY KEY,
  race_id CHAR(36) NOT NULL,
  order_index SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  title VARCHAR(160) NOT NULL,
  instructions TEXT NOT NULL,
  language ENUM('python', 'java', 'cpp', 'javascript', 'c') NOT NULL,
  starter_code TEXT NULL,
  reference_solution TEXT NULL,
  comparison_mode ENUM('normalized_exact', 'token', 'numeric', 'suffix_exact') NOT NULL DEFAULT 'suffix_exact',
  numeric_tolerance DOUBLE NULL,
  points SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  KEY race_problems_race_idx (race_id, order_index),
  CONSTRAINT race_problems_race_fk FOREIGN KEY (race_id) REFERENCES races(id) ON DELETE RESTRICT
);

CREATE TABLE race_test_cases (
  id CHAR(36) PRIMARY KEY,
  problem_id CHAR(36) NOT NULL,
  stdin TEXT NOT NULL,
  expected_stdout TEXT NOT NULL,
  is_hidden TINYINT(1) NOT NULL DEFAULT 0,
  show_expected_output TINYINT(1) NOT NULL DEFAULT 0,
  order_index SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  KEY race_test_cases_problem_idx (problem_id),
  CONSTRAINT race_test_cases_problem_fk FOREIGN KEY (problem_id) REFERENCES race_problems(id) ON DELETE RESTRICT
);

CREATE TABLE race_attempts (
  id CHAR(36) PRIMARY KEY,
  race_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  status ENUM('in_progress', 'submitted', 'timed_out') NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  submitted_at TIMESTAMP(3) NULL,
  violation_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY race_attempts_race_student_uq (race_id, student_id),
  KEY race_attempts_student_idx (student_id),
  CONSTRAINT race_attempts_race_fk FOREIGN KEY (race_id) REFERENCES races(id) ON DELETE RESTRICT,
  CONSTRAINT race_attempts_student_fk FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE race_problem_submissions (
  id CHAR(36) PRIMARY KEY,
  attempt_id CHAR(36) NOT NULL,
  problem_id CHAR(36) NOT NULL,
  source_code MEDIUMTEXT NOT NULL,
  submitted TINYINT(1) NOT NULL DEFAULT 0,
  passed_test_case_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  total_test_case_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  score SMALLINT UNSIGNED NULL,
  submitted_at TIMESTAMP(3) NULL,
  UNIQUE KEY race_problem_submissions_attempt_problem_uq (attempt_id, problem_id),
  KEY race_problem_submissions_problem_idx (problem_id),
  CONSTRAINT race_problem_submissions_attempt_fk FOREIGN KEY (attempt_id) REFERENCES race_attempts(id) ON DELETE RESTRICT,
  CONSTRAINT race_problem_submissions_problem_fk FOREIGN KEY (problem_id) REFERENCES race_problems(id) ON DELETE RESTRICT
);
