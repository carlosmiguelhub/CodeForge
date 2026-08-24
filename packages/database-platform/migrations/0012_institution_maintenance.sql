ALTER TABLE institutions
  ADD COLUMN maintenance_mode TINYINT(1) NOT NULL DEFAULT 0 AFTER timezone,
  ADD COLUMN maintenance_message VARCHAR(500) NULL AFTER maintenance_mode;
