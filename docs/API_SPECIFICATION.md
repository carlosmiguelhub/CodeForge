# SQWeb API Specification

Status: Approved planning baseline  
Base path: `/v1`  
Last updated: 2026-08-17

## 1. Protocol conventions

- HTTPS and JSON by default.
- SQL results use a bounded streaming response such as NDJSON over `fetch`.
- Firebase ID token: `Authorization: Bearer <token>`.
- App Check: `X-Firebase-AppCheck` on sensitive endpoints.
- Request correlation: `X-Request-ID`; server generates one if absent.
- Retryable mutations require `Idempotency-Key`.
- Resource IDs are opaque UUIDs.
- Dates use RFC 3339 UTC.
- Pagination uses opaque cursor tokens, never client-calculated offsets for large operational lists.
- APIs return role-filtered DTOs rather than database records.

## 2. Standard error

```json
{
  "error": {
    "code": "WORKSPACE_NOT_READY",
    "message": "The workspace is not ready for execution.",
    "request_id": "opaque-request-id",
    "field_errors": [],
    "retry_after_seconds": 5
  }
}
```

Errors never expose credentials, hostnames, database names, hidden tests, stack traces, raw driver configuration, or unrestricted SQL diagnostics.

## 3. Authentication and authorization behavior

- Every endpoint except provider callbacks and initial registration requires a verified Firebase ID token.
- Email verification is required before enrollment or execution.
- Sensitive endpoints require App Check.
- The server resolves account state, institution, role, class membership, ownership, resource state, and policy.
- A successful list/read response contains only resources within the caller's authorized scope.
- `401` means missing/invalid identity; `403` means authenticated but unauthorized; `404` may conceal resource existence across boundaries.

## 4. Endpoint catalog

| Method and endpoint                   | Purpose                                  | Authorization                       | App Check |
| ------------------------------------- | ---------------------------------------- | ----------------------------------- | --------: |
| `GET /me`                             | Profile, memberships, broad permissions  | Authenticated                       |        No |
| `POST /registrations`                 | Complete verified profile                | Verified identity                   |       Yes |
| `GET /academic-options`               | Active course and term selectors         | Teacher/admin                       |        No |
| `GET /admin/academics`                | Institution academic catalog             | Admin                               |        No |
| `POST /admin/academics/departments`   | Create department                        | Admin                               |       Yes |
| `POST /admin/academics/programs`      | Create program                           | Admin                               |       Yes |
| `POST /admin/academics/courses`       | Create course                            | Admin                               |       Yes |
| `POST /admin/academics/terms`         | Create term                              | Admin                               |       Yes |
| `GET /classes`                        | Scoped class list                        | Member                              |        No |
| `POST /classes`                       | Create class                             | Approved teacher/admin              |       Yes |
| `GET /classes/{id}`                   | Role-filtered class detail               | Enrolled/assigned/admin             |        No |
| `PATCH /classes/{id}`                 | Update mutable class data                | Owning teacher/admin                |       Yes |
| `POST /classes/{id}/join`             | Join with invitation code                | Student                             |       Yes |
| `GET /classes/{id}/roster`            | Paginated roster                         | Assigned teacher/admin              |        No |
| `PATCH /classes/{id}/roster/{userId}` | Change enrollment state                  | Assigned teacher/admin              |       Yes |
| `POST /classes/{id}/invites`          | Create invitation                        | Owning teacher                      |       Yes |
| `DELETE /class-invites/{id}`          | Revoke invitation                        | Owning teacher                      |       Yes |
| `GET /templates`                      | Scoped template list                     | Teacher/admin                       |        No |
| `POST /templates`                     | Create template                          | Teacher/admin                       |       Yes |
| `POST /templates/{id}/versions`       | Upload immutable version                 | Owner/admin                         |       Yes |
| `POST /templates/{id}/validate`       | Build disposable preview                 | Owner/admin                         |       Yes |
| `GET /activities`                     | Scoped activity list                     | Enrolled/assigned                   |        No |
| `POST /activities`                    | Create draft activity                    | Teacher                             |       Yes |
| `GET /activities/{id}`                | Safe role-filtered activity              | Enrolled/assigned                   |        No |
| `POST /activities/{id}/versions`      | Create draft version                     | Owning teacher                      |       Yes |
| `POST /activities/{id}/publish`       | Publish immutable version                | Owning teacher                      |       Yes |
| `POST /activities/{id}/preview`       | Preview as student                       | Owning teacher                      |       Yes |
| `GET /v1/workspaces`                  | List caller-owned safe workspace states  | Student/teacher                     |        No |
| `POST /v1/workspaces`                 | Request authorized personal provisioning | Student/teacher                     |       Yes |
| `GET /v1/workspaces/{id}`             | Safe state and quota; no DB identifiers  | Owner/admin                         |        No |
| `POST /v1/workspaces/{id}/reset`      | Request replacement-based reset          | Owner when ready/failed             |       Yes |
| `GET /workspaces/{id}/schema`         | Bounded safe schema tree                 | Workspace-authorized                |       Yes |
| `POST /execution-grants`              | Mint short-lived bound execution grant   | Workspace-authorized                |       Yes |
| `POST /executions`                    | Execute SQL and stream results           | ID token + App Check + grant        |       Yes |
| `DELETE /executions/{id}`             | Cancel running execution                 | Owner/assigned teacher/admin        |       Yes |
| `GET /query-history`                  | Paginated authorized history             | Owner/scoped teacher/admin metadata |        No |
| `GET /saved-queries`                  | List saved queries                       | Owner                               |        No |
| `POST /saved-queries`                 | Create saved query                       | Owner                               |       Yes |
| `PATCH /saved-queries/{id}`           | Update saved query                       | Owner                               |       Yes |
| `DELETE /saved-queries/{id}`          | Delete saved query                       | Owner                               |       Yes |
| `POST /submissions`                   | Create immutable attempt                 | Student                             |       Yes |
| `GET /submissions/{id}`               | Role-filtered submission                 | Student owner/assigned teacher      |        No |
| `POST /submissions/{id}/reopen`       | Permit another attempt                   | Assigned teacher                    |       Yes |
| `POST /grading-runs`                  | Queue grade/regrade                      | System/assigned teacher             |       Yes |
| `GET /grading-runs/{id}`              | Safe grading status/result               | Student owner/assigned teacher      |        No |
| `PATCH /grades/{id}`                  | Manual points and feedback               | Assigned teacher                    |       Yes |
| `POST /grades/{id}/release`           | Release grade                            | Assigned teacher                    |       Yes |
| `GET /gradebook`                      | Paginated class gradebook                | Assigned teacher/admin              |        No |
| `POST /exports`                       | Create authorized export                 | Scoped caller                       |       Yes |
| `GET /notifications`                  | List own notifications                   | Recipient                           |        No |
| `PATCH /notifications/{id}`           | Mark read                                | Recipient                           |       Yes |
| `GET /admin/users/pending`            | List pending privileged accounts         | Admin                               |       Yes |
| `GET /admin/users`                    | Filtered user management list            | Admin                               |       Yes |
| `PATCH /admin/users/{id}`             | Approve/suspend/reactivate/role          | Admin                               |       Yes |
| `GET /admin/query-monitor`            | Execution metadata                       | Admin                               |       Yes |
| `GET /admin/audit-events`             | Filtered audit log                       | Admin                               |       Yes |
| `GET /admin/infrastructure`           | Health/capacity summaries                | Admin                               |       Yes |
| `PATCH /admin/settings`               | Versioned global settings                | Admin                               |       Yes |

## 5. Execution grant

### Request

```json
{
  "workspace_id": "uuid",
  "activity_id": "uuid-or-null",
  "requested_mode": "interactive"
}
```

### Response

```json
{
  "grant": "signed-opaque-token",
  "expires_at": "2026-08-17T12:00:00Z",
  "effective_policy": {
    "max_statements": 5,
    "timeout_ms": 10000,
    "max_rows_per_result": 1000,
    "max_result_sets": 5,
    "max_output_bytes": 5242880
  }
}
```

The response never includes database connection information. The grant binds UID, institution, workspace, activity, role, policy version, expiry, and nonce.

## 6. SQL execution

### Request

```json
{
  "grant": "signed-opaque-token",
  "sql": "SELECT ...",
  "selection": {
    "mode": "selected",
    "start_offset": 0,
    "end_offset": 42
  },
  "transaction_mode": "auto"
}
```

`selection` is informational for history and editor behavior. The server executes only the supplied `sql` string and independently parses it.

### Milestone 5 response

`POST /v1/executions` returns one bounded JSON document after execution reaches a terminal state. It contains the opaque execution ID, terminal state, zero or more result sets, safe messages, and duration/row/byte/statement statistics. Each result set contains safe column metadata, bounded rows, affected rows, warning count, and a truncation indicator. Incremental streaming is post-MVP and must preserve the same limits and terminal-state contract.

Terminal states are `successful`, `failed`, `timed_out`, `cancelled`, and `limit_exceeded`.

## 7. Cancellation

`DELETE /v1/executions/{id}` is idempotent for the owning actor. It verifies actor scope, marks the running control record cancelled, and asks the execution boundary to terminate the mapped connection. It never accepts or returns a MySQL connection ID. Production multi-instance deployment must use the private cancellation/control topology in `ARCHITECTURE.md`; the local single-process adapter is not a production scaling design.

## 8. Submission and grading contracts

- Submission request names an activity, activity version, draft/snapshot reference, and idempotency key.
- Server verifies deadline, attempt count, enrollment, snapshot ownership, and published version.
- Successful submission returns immutable attempt number and checksum.
- Student grading DTOs include only visible tests, safe hidden-test summaries, score, and released feedback.
- Teacher DTOs may contain internal diagnostic detail only when authorized.
- Regrade requests require a reason and create a new run.

## 9. Import and export constraints

- Import is post-MVP but must use pre-authorized upload sessions.
- Maximum import is 25 MB and is quarantined before processing.
- Export generation is asynchronous.
- Export downloads use short-lived signed URLs, safe filenames, and seven-day expiry.
- Export APIs enforce row, field, institution, class, and role scope.

## 10. Concurrency and idempotency

- Create, submit, publish, reset, grade, provision, export, and administrative mutation endpoints require idempotency keys.
- Conflicting version updates return `409 VERSION_CONFLICT`.
- Quota exhaustion returns `429` with safe retry information.
- Workspace-not-ready returns `409 WORKSPACE_NOT_READY`.
- Queue-backed operations return `202` and an operation resource.

## 11. Versioning and compatibility

- Breaking changes require a new API major version.
- Additive response fields may be introduced within `/v1`.
- Clients ignore unknown additive fields.
- Every deployed API publishes a contract artifact used by web and integration tests.
