ALTER TABLE activities
  ADD COLUMN comparison_mode ENUM('normalized_exact', 'token', 'numeric') NOT NULL DEFAULT 'normalized_exact' AFTER allow_retake,
  ADD COLUMN numeric_tolerance DOUBLE NULL AFTER comparison_mode;

ALTER TABLE activity_test_cases
  ADD COLUMN is_hidden TINYINT(1) NOT NULL DEFAULT 0 AFTER expected_stdout,
  ADD COLUMN show_expected_output TINYINT(1) NOT NULL DEFAULT 0 AFTER is_hidden;
