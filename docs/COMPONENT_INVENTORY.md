# SQWeb Component Inventory

Status: Approved planning baseline  
Last updated: 2026-08-17

Implemented through Milestone 4: `AppShell`, identity screens, classroom components, `AcademicCatalogPanel`, and `WorkspaceList` lifecycle UI. Remaining entries are the approved forward inventory.

`WorkspaceList` exposes safe state, quota, request, refresh, and replacement reset without database names or credentials.

## 1. Component architecture rules

- Shared role-aware components replace duplicated role interfaces.
- Components consume semantic design tokens, not raw one-off colors.
- Permission-driven visibility improves usability but never substitutes for API authorization.
- Every component defines loading, empty, error, disabled, permission-denied, and reduced-motion behavior where applicable.
- Complex components publish keyboard and screen-reader interaction contracts.

## 2. Foundation components

| Component           | Responsibilities                                    | Accessibility contract                       |
| ------------------- | --------------------------------------------------- | -------------------------------------------- |
| `AppShell`          | Sidebar, top bar, main landmark, responsive regions | Skip link, landmarks, logical focus order    |
| `RoleNavigation`    | Role-specific authorized links                      | Current-page semantics; collapsed tooltips   |
| `TopAppBar`         | Context, global actions, notifications              | Labeled controls and predictable tab order   |
| `WorkspaceSwitcher` | Select authorized workspace context                 | Searchable listbox; no DB identifiers        |
| `UserMenu`          | Profile, preferences, sign out                      | Menu keyboard pattern and focus restoration  |
| `Breadcrumbs`       | Hierarchy and return paths                          | Navigation landmark; current item semantics  |
| `CommandPalette`    | Fast navigation/actions                             | Dialog semantics, search label, Escape close |
| `KeyboardHelp`      | Shortcut discovery                                  | Structured table/list, conflict guidance     |

## 3. Primitive components

| Component             | Variants/notes                                                    |
| --------------------- | ----------------------------------------------------------------- |
| Button                | Primary, secondary, ghost, destructive, icon-only                 |
| Icon                  | Lucide-backed, decorative or labeled; no improvised paths         |
| TextField/TextArea    | Visible label, description, validation                            |
| Select/Combobox       | Native where sufficient; accessible custom behavior when required |
| Checkbox/Radio/Switch | Label and state text                                              |
| FormField             | Label, control, help, error composition                           |
| StatusIndicator       | Dot/icon plus text label                                          |
| Badge/Tag             | Genuine metadata only                                             |
| Tooltip               | Supplementary; never sole access to required information          |
| Menu/Popover          | Anchored, collision-aware, keyboard accessible                    |
| Dialog/AlertDialog    | Modal focus, Escape policy, focus restoration                     |
| Drawer                | Responsive navigation/context panel                               |
| Tabs                  | Roving focus and associated panels                                |
| Toast                 | Noncritical feedback; important state also remains in page        |
| Progress              | Determinate/indeterminate with accessible name                    |
| Skeleton              | Reduced-motion-compatible loading placeholder                     |
| EmptyState            | Specific next action without marketing filler                     |
| ErrorState            | Safe error, request ID, retry/recovery action                     |
| PermissionState       | Explains unavailable action without leaking resource data         |

## 4. Data display components

| Component           | Responsibilities                                       |
| ------------------- | ------------------------------------------------------ |
| `DataTable`         | Sort, filter, pagination, selection, row actions       |
| `VirtualizedGrid`   | Large result sets with accessible row/column context   |
| `ColumnHeader`      | Sort state, resize, type metadata                      |
| `Pagination`        | Cursor-based navigation and result count context       |
| `KpiStrip`          | Compact meaningful metrics                             |
| `TrendChart`        | Defined measure/period/units plus text summary/table   |
| `ActivityTimeline`  | Ordered events with timestamps and actor labels        |
| `AuditEventTable`   | Dense filterable append-only event view                |
| `DiffViewer`        | Before/after SQL, policy, grade, or schema differences |
| `KeyValueInspector` | Query statistics and object metadata                   |

## 5. Workbench components

| Component                 | Responsibilities and states                                                   |
| ------------------------- | ----------------------------------------------------------------------------- |
| `WorkbenchShell`          | Coordinates explorer, editor, results, context, full-screen modes             |
| `ResizablePanelGroup`     | Pointer and keyboard resizing with min/max constraints                        |
| `SchemaExplorer`          | Accessible tree of tables, columns, keys, indexes, views                      |
| `ObjectDetails`           | Structure, safe metadata, indexes/keys                                        |
| `EditorTabBar`            | Multiple tabs, dirty state, close/restore, keyboard movement                  |
| `SqlEditor`               | Monaco wrapper, no wrap default, adjustable font, horizontal scroll           |
| `SqlToolbar`              | Run selected/current/all, explain, transaction, cancel, format when available |
| `ConnectionStatus`        | Connected/disconnected/reconnecting label and icon                            |
| `ExecutionStateAnnouncer` | Polite/assertive live-region messages                                         |
| `ResultTabs`              | Multiple result sets, messages, statistics, history                           |
| `ResultGrid`              | Virtualized rows, horizontal scroll, copy, truncation state                   |
| `MessageConsole`          | Sanitized SQL/policy/platform messages with categories                        |
| `QueryStatistics`         | Duration, rows, bytes, affected rows, warnings                                |
| `QueryHistoryPanel`       | Paginated history, rerun, save                                                |
| `TransactionControl`      | Autocommit state, commit, rollback, confirmation                              |
| `ExplainViewer`           | MVP textual/tabular plan; visual plan later                                   |
| `ActivityContextPanel`    | Instructions, visible tests, attempts, deadline                               |
| `DestructiveConfirmation` | Parsed action, object, statement hash confirmation                            |
| `WorkspaceResetDialog`    | Template, consequences, authorization, progress                               |

## 6. Student components

- `DueActivityList`
- `ContinueActivityAction`
- `WorkspaceStatusSummary`
- `ProgressSummary`
- `RecentQueryList`
- `RecentGradeList`
- `ClassJoinForm`
- `ActivityInstructions`
- `AttemptCounter`
- `VisibleTestResults`
- `SubmissionTimeline`
- `ReleasedFeedback`
- `SavedQueryLibrary`

## 7. Teacher components

- `ClassOverview`
- `RosterManager`
- `InvitationManager`
- `TemplateLibrary`
- `TemplateVersionEditor`
- `DatasetUploader`
- `ActivityBuilder`
- `SqlPolicyEditor`
- `TestCaseBuilder`
- `ScheduleEditor`
- `StudentPreview`
- `GradingQueue`
- `SubmissionReview`
- `RubricPanel`
- `FeedbackEditor`
- `GradebookGrid`
- `CompletionAnalytics`
- `CommonErrorSummary`

## 8. Administrator components

- `AccountApprovalQueue`
- `UserStatusManager`
- `RoleAssignmentEditor`
- `AcademicStructureManager`
- `WorkspacePoolSummary`
- `CapacityGauge`
- `QueryMonitor`
- `AdministrativeCancelDialog`
- `ServiceHealthSummary`
- `BackupStatus`
- `RetentionPolicyEditor`
- `QuotaPolicyEditor`
- `GlobalSqlPolicyEditor`
- `MaintenanceModeControl`
- `SecurityEventList`
- `UsageReportBuilder`
- `CostReportSummary`

## 9. Dashboard composition

### Student dashboard

- Next required action and Continue activity command.
- Current workspace state.
- Activities due.
- Recent grades and queries.
- Progress and categorized failed-query trend.

### Teacher dashboard

- Grading queue and pending submissions.
- Active classes and completion rates.
- Students needing attention.
- Recent class activity and common SQL error categories.

### Administrator dashboard

- Running, failed, and timed-out queries.
- User activity, database/storage capacity, service health.
- Security alerts, cleanup backlog, and recent administrative actions.

Charts are included only when they correspond to real stored metrics and provide an accessible summary.

## 10. Component test matrix

Each shared component requires:

- Unit tests for state and emitted actions.
- Keyboard tests for interactive patterns.
- Automated accessibility checks.
- Visual snapshots for supported viewports and significant states.
- High-contrast/focus and reduced-motion review.
- Long-label, empty, error, permission, and loading fixtures.

Workbench components additionally require large-column, large-row, long-SQL, cancellation, truncation, and split-panel tests.
