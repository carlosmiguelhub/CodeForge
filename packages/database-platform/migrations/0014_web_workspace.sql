CREATE TABLE web_workspaces (
  id CHAR(36) PRIMARY KEY,
  institution_id CHAR(36) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  content JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY web_workspaces_owner_uq (owner_id),
  CONSTRAINT web_workspaces_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
  CONSTRAINT web_workspaces_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
);
