-- Removes the classroom/academic layer (classes, enrollment, invitations,
-- and their academic catalog) introduced in 0002_classroom_core.sql. The
-- product no longer models classes, activities, submissions, or grades;
-- SQWeb is a personal SQL Workbench and code compiler only.
-- Dropped in FK-safe order (dependents before their references).
DROP TABLE IF EXISTS class_invites;
DROP TABLE IF EXISTS enrollments;
DROP TABLE IF EXISTS class_teachers;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS programs;
DROP TABLE IF EXISTS terms;
DROP TABLE IF EXISTS departments;

-- Class-scoped workspaces never shipped (workspace-service always rejected
-- them pending an activity assignment that will now never exist). Narrow
-- the enum to the only scope the product actually supports.
ALTER TABLE workspaces MODIFY COLUMN scope_type ENUM('personal') NOT NULL;
