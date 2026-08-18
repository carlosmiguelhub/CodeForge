# Platform Database Boundary

This package contains the platform-database schema boundary and versioned migrations. Milestones 2 and 3 add identity, institution membership, academic hierarchy, class, invitation, and enrollment persistence.

No database instance or credential is created by this repository. Runtime connection configuration must be supplied through the approved environment/secret mechanism.

Rules:

- Platform metadata and workspace SQL never share a database instance.
- Migrations are reviewed, versioned, and tested against real MySQL.
- Every destructive migration requires backup, forward-recovery, and rollback documentation.
- Seed data is synthetic and limited to local/test environments.
