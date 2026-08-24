CREATE TABLE sections (
  id CHAR(36) PRIMARY KEY,
  institution_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  archived_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT sections_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
  UNIQUE KEY sections_institution_name_uq (institution_id, name),
  KEY sections_institution_idx (institution_id)
);

ALTER TABLE users
  ADD COLUMN section_id CHAR(36) NULL AFTER display_name,
  ADD CONSTRAINT users_section_fk FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL;
