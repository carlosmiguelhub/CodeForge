ALTER TABLE quizzes
  ADD COLUMN quiz_type ENUM('lecture', 'code') NOT NULL DEFAULT 'lecture' AFTER title;

ALTER TABLE quiz_questions
  MODIFY COLUMN question_type ENUM('mcq', 'short_answer', 'code_choice') NOT NULL,
  ADD COLUMN language ENUM('python', 'java', 'cpp', 'javascript', 'c') NULL AFTER question_type;

ALTER TABLE quiz_attempts
  ADD COLUMN violation_count SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER status;
