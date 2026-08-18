CREATE TABLE workspace_templates (
  id CHAR(36) PRIMARY KEY, institution_id CHAR(36) NOT NULL, owner_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL, description TEXT NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT workspace_templates_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
  CONSTRAINT workspace_templates_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE template_versions (
  id CHAR(36) PRIMARY KEY, template_id CHAR(36) NOT NULL, version_number INT NOT NULL,
  mysql_version VARCHAR(32) NOT NULL, checksum CHAR(64) NOT NULL,
  state ENUM('draft','published','retired') NOT NULL DEFAULT 'draft', published_at TIMESTAMP(3) NULL,
  UNIQUE KEY template_versions_number_uq (template_id, version_number),
  CONSTRAINT template_versions_template_fk FOREIGN KEY (template_id) REFERENCES workspace_templates(id) ON DELETE RESTRICT
);

CREATE TABLE workspace_pool_instances (
  id CHAR(36) PRIMARY KEY, environment VARCHAR(32) NOT NULL, region VARCHAR(64) NOT NULL,
  service_ref VARCHAR(255) NOT NULL, state ENUM('active','draining','offline') NOT NULL DEFAULT 'active',
  database_count INT NOT NULL DEFAULT 0, capacity_json JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE workspaces (
  id CHAR(36) PRIMARY KEY, institution_id CHAR(36) NOT NULL, owner_id CHAR(36) NOT NULL,
  scope_type ENUM('personal','class') NOT NULL, scope_id CHAR(36) NOT NULL,
  template_version_id CHAR(36) NULL,
  state ENUM('requested','provisioning','ready','resetting','suspended','failed','expired','deleting','deleted') NOT NULL DEFAULT 'requested',
  quota_bytes BIGINT UNSIGNED NOT NULL, expires_at TIMESTAMP(3) NULL, failure_code VARCHAR(80) NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY workspaces_owner_scope_uq (owner_id, scope_type, scope_id),
  UNIQUE KEY workspaces_idempotency_uq (institution_id, owner_id, idempotency_key),
  KEY workspaces_state_idx (state),
  CONSTRAINT workspaces_quota_ck CHECK (quota_bytes BETWEEN 1048576 AND 262144000),
  CONSTRAINT workspaces_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
  CONSTRAINT workspaces_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT workspaces_template_version_fk FOREIGN KEY (template_version_id) REFERENCES template_versions(id) ON DELETE RESTRICT
);

CREATE TABLE workspace_allocations (
  id CHAR(36) PRIMARY KEY, workspace_id CHAR(36) NOT NULL, pool_instance_id CHAR(36) NOT NULL,
  database_name VARCHAR(64) NOT NULL, database_user VARCHAR(32) NOT NULL,
  credential_secret_ref VARCHAR(255) NOT NULL,
  allocated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), released_at TIMESTAMP(3) NULL,
  UNIQUE KEY workspace_allocations_database_uq (database_name),
  UNIQUE KEY workspace_allocations_user_uq (database_user),
  CONSTRAINT workspace_allocations_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CONSTRAINT workspace_allocations_pool_fk FOREIGN KEY (pool_instance_id) REFERENCES workspace_pool_instances(id) ON DELETE RESTRICT
);

CREATE TABLE workspace_resets (
  id CHAR(36) PRIMARY KEY, workspace_id CHAR(36) NOT NULL, actor_id CHAR(36) NOT NULL,
  reason VARCHAR(500) NOT NULL, idempotency_key VARCHAR(128) NOT NULL,
  state ENUM('requested','running','succeeded','failed') NOT NULL DEFAULT 'requested',
  started_at TIMESTAMP(3) NULL, finished_at TIMESTAMP(3) NULL,
  UNIQUE KEY workspace_resets_idempotency_uq (workspace_id, idempotency_key),
  CONSTRAINT workspace_resets_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CONSTRAINT workspace_resets_actor_fk FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT
);
