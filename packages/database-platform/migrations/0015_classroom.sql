CREATE TABLE classes (
  id CHAR(36) PRIMARY KEY, institution_id CHAR(36) NOT NULL, teacher_id CHAR(36) NOT NULL,
  subject_name VARCHAR(120) NOT NULL, section_label VARCHAR(60) NOT NULL, join_code CHAR(6) NOT NULL,
  archived_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY classes_join_code_uq (join_code),
  KEY classes_teacher_idx (teacher_id),
  CONSTRAINT classes_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
  CONSTRAINT classes_teacher_fk FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE class_members (
  id CHAR(36) PRIMARY KEY, class_id CHAR(36) NOT NULL, student_id CHAR(36) NOT NULL,
  status ENUM('active', 'removed') NOT NULL DEFAULT 'active',
  joined_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY class_members_class_student_uq (class_id, student_id),
  KEY class_members_student_idx (student_id),
  CONSTRAINT class_members_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT class_members_student_fk FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT
);
