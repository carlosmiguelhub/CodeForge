# SQWeb Platform API

Milestones 2 and 3 implement Firebase identity verification, App Check enforcement, server-authoritative account status and role policy, registration, administrator approval, academic catalog, Teacher-owned class, invitation, enrollment, and roster endpoints.

## Required local configuration

Copy the repository `.env.example` values into an ignored local environment file or provide them through the process environment. Never commit credentials or database URLs.

The API requires:

- Application Default Credentials authorized for the selected Firebase project.
- A migrated platform MySQL database.
- A server-selected default institution UUID.
- An explicit web-origin allowlist.

No Firebase project, database, migration, institution, or administrator is created automatically. The first administrator must be established through a separately reviewed operational bootstrap procedure before deployment; public registration deliberately cannot request Administrator authority.
