ALTER TABLE sections
  ADD COLUMN locked_workspaces_json JSON NULL AFTER name;
