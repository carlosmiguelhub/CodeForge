CREATE TABLE quizzes (
  id CHAR(36) PRIMARY KEY,
  class_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  opens_at TIMESTAMP(3) NOT NULL,
  closes_at TIMESTAMP(3) NOT NULL,
  status ENUM('draft', 'open', 'closed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY quizzes_class_idx (class_id),
  KEY quizzes_availability_idx (status, opens_at, closes_at),
  CONSTRAINT quizzes_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT
);

CREATE TABLE quiz_questions (
  id CHAR(36) PRIMARY KEY,
  quiz_id CHAR(36) NOT NULL,
  question_text TEXT NOT NULL,
  question_type ENUM('mcq', 'short_answer') NOT NULL,
  options_json JSON NULL,
  correct_answer TEXT NOT NULL,
  points SMALLINT UNSIGNED NOT NULL,
  order_index SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  KEY quiz_questions_quiz_idx (quiz_id, order_index),
  CONSTRAINT quiz_questions_quiz_fk FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE RESTRICT
);

CREATE TABLE quiz_attempts (
  id CHAR(36) PRIMARY KEY,
  quiz_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  submitted_at TIMESTAMP(3) NULL,
  score INT UNSIGNED NULL,
  status ENUM('in_progress', 'submitted', 'timed_out') NOT NULL DEFAULT 'in_progress',
  UNIQUE KEY quiz_attempts_quiz_student_uq (quiz_id, student_id),
  KEY quiz_attempts_student_idx (student_id),
  CONSTRAINT quiz_attempts_quiz_fk FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE RESTRICT,
  CONSTRAINT quiz_attempts_student_fk FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE quiz_answers (
  id CHAR(36) PRIMARY KEY,
  quiz_attempt_id CHAR(36) NOT NULL,
  question_id CHAR(36) NOT NULL,
  response TEXT NOT NULL,
  is_correct TINYINT(1) NOT NULL,
  points_awarded SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY quiz_answers_attempt_question_uq (quiz_attempt_id, question_id),
  KEY quiz_answers_question_idx (question_id),
  CONSTRAINT quiz_answers_attempt_fk FOREIGN KEY (quiz_attempt_id) REFERENCES quiz_attempts(id) ON DELETE RESTRICT,
  CONSTRAINT quiz_answers_question_fk FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE RESTRICT
);
