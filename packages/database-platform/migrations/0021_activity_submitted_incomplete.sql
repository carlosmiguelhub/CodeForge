ALTER TABLE activity_attempts
  MODIFY COLUMN status ENUM('in_progress', 'passed', 'submitted_incomplete', 'zeroed_violation')
    NOT NULL DEFAULT 'in_progress';
