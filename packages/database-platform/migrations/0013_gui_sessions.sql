CREATE TABLE gui_session_pool_instances (
  id CHAR(36) PRIMARY KEY, environment VARCHAR(32) NOT NULL, region VARCHAR(64) NOT NULL,
  service_ref VARCHAR(255) NOT NULL, state ENUM('active','draining','offline') NOT NULL DEFAULT 'active',
  session_count INT NOT NULL DEFAULT 0, capacity_json JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE java_gui_workspaces (
  id CHAR(36) PRIMARY KEY, institution_id CHAR(36) NOT NULL, owner_id CHAR(36) NOT NULL,
  content JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY java_gui_workspaces_owner_uq (owner_id),
  CONSTRAINT java_gui_workspaces_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
  CONSTRAINT java_gui_workspaces_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE gui_sessions (
  id CHAR(36) PRIMARY KEY, institution_id CHAR(36) NOT NULL, owner_id CHAR(36) NOT NULL,
  main_class_name VARCHAR(120) NOT NULL,
  state ENUM('requested','provisioning','running','stopped','failed','expired') NOT NULL DEFAULT 'requested',
  max_runtime_seconds INT UNSIGNED NOT NULL, failure_code VARCHAR(80) NULL,
  started_at TIMESTAMP(3) NULL, ends_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY gui_sessions_state_idx (state), KEY gui_sessions_owner_created_idx (owner_id, created_at),
  CONSTRAINT gui_sessions_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
  CONSTRAINT gui_sessions_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE gui_container_allocations (
  id CHAR(36) PRIMARY KEY, session_id CHAR(36) NOT NULL, pool_instance_id CHAR(36) NOT NULL,
  container_ref VARCHAR(255) NOT NULL, internal_host VARCHAR(255) NOT NULL, websockify_port SMALLINT UNSIGNED NOT NULL,
  allocated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), released_at TIMESTAMP(3) NULL,
  cleanup_state ENUM('active','pending','cleaning','complete','failed') NOT NULL DEFAULT 'active',
  cleanup_attempts INT NOT NULL DEFAULT 0, cleanup_error VARCHAR(80) NULL,
  UNIQUE KEY gui_container_allocations_session_uq (session_id),
  KEY gui_container_allocations_cleanup_idx (cleanup_state, cleanup_attempts),
  CONSTRAINT gui_container_allocations_session_fk FOREIGN KEY (session_id) REFERENCES gui_sessions(id) ON DELETE RESTRICT,
  CONSTRAINT gui_container_allocations_pool_fk FOREIGN KEY (pool_instance_id) REFERENCES gui_session_pool_instances(id) ON DELETE RESTRICT
);
