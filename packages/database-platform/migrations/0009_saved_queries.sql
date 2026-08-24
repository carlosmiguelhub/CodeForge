CREATE TABLE saved_queries (
  id CHAR(36) PRIMARY KEY, institution_id CHAR(36) NOT NULL, owner_id CHAR(36) NOT NULL, workspace_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL, sql_text TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY saved_queries_owner_workspace_idx (owner_id, workspace_id),
  CONSTRAINT saved_queries_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
  CONSTRAINT saved_queries_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT saved_queries_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT
);
