CREATE TABLE departments (
  id CHAR(36) PRIMARY KEY,
  institution_id CHAR(36) NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(160) NOT NULL,
  status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY departments_institution_code_uq (institution_id, code),
  CONSTRAINT departments_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT
);

CREATE TABLE programs (
  id CHAR(36) PRIMARY KEY,
  institution_id CHAR(36) NOT NULL,
  department_id CHAR(36) NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(160) NOT NULL,
  status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY programs_institution_code_uq (institution_id, code),
  KEY programs_department_idx (department_id),
  CONSTRAINT programs_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
  CONSTRAINT programs_department_fk FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT
);

CREATE TABLE terms (
  id CHAR(36) PRIMARY KEY,
  institution_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  starts_at TIMESTAMP(3) NOT NULL,
  ends_at TIMESTAMP(3) NOT NULL,
  status ENUM('upcoming', 'active', 'closed') NOT NULL DEFAULT 'upcoming',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY terms_institution_name_uq (institution_id, name),
  CONSTRAINT terms_dates_ck CHECK (ends_at > starts_at),
  CONSTRAINT terms_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT
);

CREATE TABLE courses (
  id CHAR(36) PRIMARY KEY,
  institution_id CHAR(36) NOT NULL,
  department_id CHAR(36) NOT NULL,
  code VARCHAR(32) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY courses_institution_code_uq (institution_id, code),
  KEY courses_department_idx (department_id),
  CONSTRAINT courses_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
  CONSTRAINT courses_department_fk FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT
);

CREATE TABLE classes (
  id CHAR(36) PRIMARY KEY,
  institution_id CHAR(36) NOT NULL,
  course_id CHAR(36) NOT NULL,
  term_id CHAR(36) NOT NULL,
  section VARCHAR(80) NOT NULL,
  owner_teacher_id CHAR(36) NOT NULL,
  status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  schedule_json JSON NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY classes_course_term_section_uq (course_id, term_id, section),
  KEY classes_institution_status_idx (institution_id, status),
  KEY classes_owner_idx (owner_teacher_id),
  CONSTRAINT classes_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
  CONSTRAINT classes_course_fk FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
  CONSTRAINT classes_term_fk FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE RESTRICT,
  CONSTRAINT classes_owner_fk FOREIGN KEY (owner_teacher_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE class_teachers (
  class_id CHAR(36) NOT NULL,
  teacher_id CHAR(36) NOT NULL,
  permission_level ENUM('owner', 'assistant') NOT NULL DEFAULT 'assistant',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (class_id, teacher_id),
  CONSTRAINT class_teachers_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT class_teachers_teacher_fk FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE enrollments (
  id CHAR(36) PRIMARY KEY,
  class_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  state ENUM('active', 'removed') NOT NULL DEFAULT 'active',
  joined_at TIMESTAMP(3) NOT NULL,
  removed_at TIMESTAMP(3) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY enrollments_class_student_uq (class_id, student_id),
  KEY enrollments_student_state_idx (student_id, state),
  CONSTRAINT enrollments_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT enrollments_student_fk FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE class_invites (
  id CHAR(36) PRIMARY KEY,
  class_id CHAR(36) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  usage_limit INT NOT NULL,
  usage_count INT NOT NULL DEFAULT 0,
  revoked_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY class_invites_code_hash_uq (code_hash),
  KEY class_invites_class_idx (class_id),
  CONSTRAINT class_invites_usage_limit_ck CHECK (usage_limit BETWEEN 1 AND 60),
  CONSTRAINT class_invites_usage_count_ck CHECK (usage_count BETWEEN 0 AND usage_limit),
  CONSTRAINT class_invites_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT
);
