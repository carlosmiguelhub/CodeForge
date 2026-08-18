# SQWeb Responsive Behavior

Status: Approved planning baseline  
Last updated: 2026-08-17

## 1. Viewport model

Breakpoints are behavioral starting points and must be validated with content; components may adapt earlier when their content no longer fits.

| Mode            |   Starting width | Shell                             | Workbench                                                    |
| --------------- | ---------------: | --------------------------------- | ------------------------------------------------------------ |
| Wide desktop    | 1440px and above | Expanded/collapsible sidebar      | Explorer + editor/results + context visible                  |
| Standard laptop |      1024–1439px | Compact sidebar                   | Context closed by default; editor/results split              |
| Tablet          |       768–1023px | Navigation drawer or compact rail | Explorer/editor/results/context switch through tabs/drawers  |
| Mobile          |      Below 768px | Top bar and navigation drawer     | Basic editor with full-screen schema/results/messages panels |

## 2. Global shell

| Behavior                | Desktop/laptop         | Tablet/mobile                                  |
| ----------------------- | ---------------------- | ---------------------------------------------- |
| Primary navigation      | Persistent sidebar     | Drawer                                         |
| User/workspace controls | Sidebar footer/top bar | Top bar menus                                  |
| Page margins            | Up to 32px             | 16px, then 12px where necessary                |
| Page titles             | Compact 24–32px        | 20–24px                                        |
| Primary actions         | Header/action row      | Sticky or reachable action row, not hidden     |
| Breadcrumbs             | Full or compressed     | Back action plus concise current context       |
| Dense filters           | Inline toolbar         | Overflow sheet/drawer with active-filter count |

## 3. Workbench behavior

### Wide desktop

- Left explorer defaults to 240px and is collapsible.
- Center editor/results use a keyboard-resizable horizontal split.
- Optional right context defaults to 320px.
- Full editor toolbar and result metadata are visible.

### Standard laptop

- Left explorer may default to compact width.
- Right context is closed and available through a labeled toggle.
- Secondary toolbar commands move into an overflow menu.
- Results retain minimum column widths and horizontal scrolling.

### Tablet

- One main content panel is active: Editor, Results, Schema, or Activity.
- Editor and Results can each enter full-screen mode.
- Run and Cancel remain persistently reachable.
- Schema selection returns focus to the invoking editor context.
- Drag-only resizing is removed; panel tabs replace simultaneous narrow columns.

### Mobile

- Basic SQL editing and execution remain available.
- SQL editor and result grid scroll horizontally.
- Results, messages, statistics, schema, and instructions open as full-screen views.
- Primary Run/Cancel actions remain reachable without horizontal toolbar scrolling.
- Wide tables are never collapsed into unreadable cells.
- Returning from a result panel restores editor cursor/focus context where possible.

## 4. Explicit mobile limitations

The MVP mobile Workbench does not provide:

- Simultaneous multi-panel display.
- Table data editing.
- Complex object-creation dialogs.
- Visual execution-plan diagrams.
- Large SQL/CSV import or template authoring.
- Precision column resizing.
- Full desktop keyboard-shortcut parity.

Every unavailable side panel has a read-only or full-screen alternative when it contains required information. Unsupported authoring operations are labeled and direct the user to a larger viewport; they are not silently hidden.

## 5. Tables and grids

- Maintain useful minimum column widths.
- Use an explicit horizontal scroll container with visible affordance.
- Sticky first column is optional only when it does not obscure other data.
- On mobile, operational lists may use a purpose-designed summary row that opens full details; arbitrary database result grids never transform data into cards.
- Pagination and result-limit state remain visible.
- Virtualization must not break keyboard navigation or screen-reader row/column position.

## 6. Forms and builders

| Context          | Desktop                                               | Small screen                     |
| ---------------- | ----------------------------------------------------- | -------------------------------- |
| Simple forms     | Multi-column when relationships are clear             | Single column                    |
| Activity builder | Navigation + main editor + preview where space allows | Step navigation with saved draft |
| Test builder     | Dense table and editor                                | One test per focused screen      |
| Grading          | Submission and rubric side by side                    | Submission/rubric/feedback tabs  |
| Admin settings   | Section navigation and form                           | Section list, then focused form  |

Draft state persists when moving between responsive steps.

## 7. Dashboard behavior

- KPI regions wrap according to priority, not equal-width decorative cards.
- The next required action remains first in DOM and visual priority.
- Dense lists become vertically stacked but retain timestamps, status labels, and actions.
- Charts provide a summary table and may simplify series count on small screens without omitting required values.
- Dashboard headings remain compact to protect working space.

## 8. Touch, keyboard, zoom, and orientation

- Practical touch targets are 44px where possible.
- Touch targets never rely on hover-only affordances.
- Keyboard order follows the logical reading order even when CSS changes visual layout.
- At 200% zoom, required controls and content remain available without two-dimensional page scrolling; data/editor regions may have their own necessary horizontal scroll.
- Tablet orientation changes preserve current editor draft, panel, result set, and focus context.
- The application does not force orientation.

## 9. Responsive acceptance matrix

| Workflow                       | Wide desktop |    Laptop |            Tablet |                     Mobile |
| ------------------------------ | -----------: | --------: | ----------------: | -------------------------: |
| Sign in/profile                |         Full |      Full |              Full |                       Full |
| Student dashboard              |         Full |      Full |              Full |                       Full |
| Join/view class                |         Full |      Full |              Full |                       Full |
| View activity/submission/grade |         Full |      Full |              Full |                       Full |
| Basic SQL edit/run/results     |         Full |      Full |            Tabbed | Focused/full-screen panels |
| Schema exploration             |    Full tree | Full tree |        Drawer/tab |           Full-screen tree |
| Table data editing             |     Post-MVP |  Post-MVP |           Not MVP |                    Not MVP |
| Teacher activity creation      |         Full |      Full |        Step-based |    Review/basic edits only |
| Teacher grading                |        Split |     Split |            Tabbed |               Focused tabs |
| Admin monitoring               |         Full |      Full | Responsive tables |             Summary/detail |
| Large imports/templates        |         Full |      Full |           Not MVP |                    Not MVP |

## 10. Verification

- Playwright viewport tests at representative widths within every mode.
- Tests just above and below each behavioral transition.
- Realistic long SQL, 50+ columns, long names, localization expansion, errors, and empty states.
- Keyboard-only and screen-reader checks after panel changes.
- Device touch testing for drawers, tabs, menus, and sticky actions.
- Visual regression baselines use approved role screens and Workbench states.
