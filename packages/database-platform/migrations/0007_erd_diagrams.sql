CREATE TABLE erd_diagrams (
  id CHAR(36) PRIMARY KEY, institution_id CHAR(36) NOT NULL, owner_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL, content JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY erd_diagrams_owner_idx (owner_id),
  CONSTRAINT erd_diagrams_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
  CONSTRAINT erd_diagrams_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
);
