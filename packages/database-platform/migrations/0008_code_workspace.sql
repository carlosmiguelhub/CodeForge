CREATE TABLE code_workspaces (
  id CHAR(36) PRIMARY KEY, institution_id CHAR(36) NOT NULL, owner_id CHAR(36) NOT NULL,
  content JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY code_workspaces_owner_uq (owner_id),
  CONSTRAINT code_workspaces_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
  CONSTRAINT code_workspaces_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE code_executions (
  id CHAR(36) PRIMARY KEY, institution_id CHAR(36) NOT NULL, actor_id CHAR(36) NOT NULL,
  language VARCHAR(20) NOT NULL, status VARCHAR(30) NOT NULL, time_ms INT UNSIGNED NULL,
  started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX code_executions_actor_started_idx (actor_id, started_at),
  CONSTRAINT code_executions_actor_fk FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT
);
