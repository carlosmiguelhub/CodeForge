ALTER TABLE activities
  MODIFY COLUMN comparison_mode ENUM('normalized_exact', 'token', 'numeric', 'suffix_exact') NOT NULL DEFAULT 'suffix_exact';
