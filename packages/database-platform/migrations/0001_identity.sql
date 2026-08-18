CREATE TABLE institutions (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Manila',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY institutions_slug_uq (slug)
);

CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  firebase_uid VARCHAR(128) NOT NULL,
  email VARCHAR(320) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  status ENUM('pending_verification', 'pending_approval', 'active', 'suspended', 'deactivated') NOT NULL DEFAULT 'pending_verification',
  authorization_version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY users_firebase_uid_uq (firebase_uid),
  KEY users_email_idx (email)
);

CREATE TABLE institution_memberships (
  id CHAR(36) PRIMARY KEY,
  institution_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role ENUM('student', 'teacher', 'administrator') NOT NULL,
  approval_state ENUM('pending', 'approved', 'revoked') NOT NULL DEFAULT 'pending',
  approved_by CHAR(36) NULL,
  approved_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT memberships_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
  CONSTRAINT memberships_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT memberships_approver_fk FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY memberships_institution_user_role_uq (institution_id, user_id, role),
  KEY memberships_user_idx (user_id)
);

CREATE TABLE audit_events (
  id CHAR(36) PRIMARY KEY,
  institution_id CHAR(36) NOT NULL,
  actor_id CHAR(36) NOT NULL,
  action VARCHAR(120) NOT NULL,
  target_id VARCHAR(128) NOT NULL,
  result ENUM('succeeded', 'denied', 'failed') NOT NULL,
  reason VARCHAR(500) NULL,
  occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY audit_institution_occurred_idx (institution_id, occurred_at),
  KEY audit_actor_occurred_idx (actor_id, occurred_at)
);

