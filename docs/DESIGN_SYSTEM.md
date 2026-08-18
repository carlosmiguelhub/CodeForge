# SQWeb Design System

Status: Approved planning baseline  
Direction: Cinematic precision adapted into an original SQL command-center application  
Last updated: 2026-08-17

## 1. Design principles

1. Operational clarity before decoration.
2. Dense information organized through alignment, tone, and borders.
3. One coherent system for all roles.
4. Accents communicate action and state, never visual noise.
5. Controls remain predictable during repeated workflows.
6. Every state is perceivable without color alone.
7. Desktop-first Workbench behavior with deliberate small-screen alternatives.
8. WCAG 2.2 AA is a release criterion, not an aspiration.

## 2. Reference adaptation

Concepts retained from the supplied reference:

- Near-black tonal hierarchy.
- Compact operational navigation.
- Dense KPI and status regions.
- Thin borders and strict alignment.
- Sparse blue, cyan, lime, and orange semantic accents.
- Small-radius, mechanical controls.
- Data-oriented diagrams and contextual overlays.
- A calm, precise command-center atmosphere.

Elements that must not be copied:

- Romer name, logo, copy, labels, customers, testimonials, illustrations, or dashboard data.
- Exact landing-page composition or feature-section sequence.
- Marketing hero typography inside the authenticated application.
- Pale testimonial panels as general application surfaces.
- Decorative charts without product meaning.

The source ZIP, DESIGN.md, HTML, and five stated variants were unavailable. The approved direction is based on the three visible supplied renderings and the explicit tokens in the project brief.

## 3. Color tokens

### Surfaces and structure

| Semantic token            | Starting value | Use                               |
| ------------------------- | -------------: | --------------------------------- |
| `--surface-canvas`        |      `#070708` | Global background                 |
| `--surface-deep`          |      `#080809` | Deep content/workspace background |
| `--surface-sidebar`       |      `#0D0E0F` | Persistent navigation             |
| `--surface-primary`       |      `#101112` | Main panels and inputs            |
| `--surface-secondary`     |      `#111214` | Nested regions                    |
| `--surface-elevated`      |      `#151617` | Menus and raised controls         |
| `--surface-elevated-high` |      `#191A1C` | Dialogs/command palette           |
| `--border-internal`       |      `#1B1C1E` | Row and internal dividers         |
| `--border-structural`     |      `#232426` | Panel and control borders         |

### Text

| Semantic token     | Starting value | Use                                           |
| ------------------ | -------------: | --------------------------------------------- |
| `--text-primary`   |      `#F0F1F2` | Page headings and strongest content           |
| `--text-standard`  |      `#E5E2E3` | Normal on-surface text                        |
| `--text-secondary` |      `#C6C5D8` | Supporting text                               |
| `--text-muted`     |      `#9A9DA3` | Metadata and secondary labels                 |
| `--text-disabled`  |      `#454655` | Starting value only; adjust if contrast fails |

Disabled text is not required to meet normal text contrast when truly inactive, but it must still be recognizable. The token must not be used for active instructions or meaningful metadata.

### Semantic accents

| Semantic token             |     Value | Use                                      |
| -------------------------- | --------: | ---------------------------------------- |
| `--accent-primary`         | `#5E6BFF` | Primary action, active navigation, focus |
| `--accent-primary-soft`    | `#BEC2FF` | Supporting primary text/indicator        |
| `--accent-information`     | `#50D8E9` | Information and connected states         |
| `--accent-warning`         | `#FFB689` | Warning and late states                  |
| `--accent-success`         | `#E5FD17` | Success and genuine live status          |
| `--accent-error`           | `#FFB4AB` | Errors and destructive emphasis          |
| `--accent-error-container` | `#93000A` | Restrained error container               |

Accents are prohibited as large authenticated-app backgrounds. Charts use semantic series tokens and always include labels or patterns.

## 4. Typography

| Purpose                 | Family                                | Baseline                           |
| ----------------------- | ------------------------------------- | ---------------------------------- |
| Major page heading      | Manrope                               | 32px desktop; compact down to 24px |
| Section heading         | Manrope                               | 24px                               |
| Component heading       | Manrope                               | 18px                               |
| Dashboard value         | Manrope                               | 24–32px                            |
| Body/control/navigation | Inter                                 | 14px                               |
| Large body              | Inter                                 | 16px                               |
| Compact label           | Inter                                 | 12px; never for long instructions  |
| Dense data              | Inter or monospace                    | 12–13px                            |
| SQL/editor/output       | JetBrains Mono, ui-monospace fallback | User-adjustable, default 14px      |

- Manrope headings use restrained negative letter spacing.
- Dashboard headings never use marketing-scale typography.
- Numeric tables use tabular figures.
- Users can adjust editor font size without breaking panels.

## 5. Spacing, sizing, and shape

- Base unit: 4px.
- Operational gaps/padding: 8px or 12px.
- Component grouping: 16px.
- Major regions: 24px.
- Exceptional page separation: 40px.
- Desktop safe margin: 32px; standard grid gutter: 20px.
- Inputs/buttons: 4px radius.
- Menus/compact controls: 4–6px radius.
- Major panels: maximum 8px radius.
- Pills are reserved for tags, filters, and statuses.
- Dense table rows: 32px or 40px.
- Default desktop control height: 32–36px.
- Practical mobile touch target: 44px where layout permits; never below WCAG 2.2 minimum target requirements without an allowed exception.

## 6. Elevation and overlays

- Prefer tonal steps, structural borders, and a subtle 1px top-edge highlight.
- Avoid large shadows and global glassmorphism.
- Floating menus, dialogs, and command palettes may use a translucent dark surface and approximately 20px background blur.
- Overlays trap focus only when modal, restore focus on close, support Escape, and never obscure the sole route to a required action.

## 7. Motion

- Standard transition: 120–200ms.
- Animate opacity, background, border, or small positional changes.
- No bouncing, parallax, decorative loops, or constant pulsing.
- Pulse is limited to genuinely running/live state.
- `prefers-reduced-motion` removes nonessential animation and pulse.
- Query-state changes are also announced textually.

## 8. Navigation

- Persistent left sidebar on desktop and standard laptop.
- Sidebar collapses from label/icon to icon-only and provides accessible tooltips.
- Tablet/mobile use a navigation drawer.
- Active route uses raised tone plus a primary accent and current-page semantics.
- Workspace/user controls are visually separated from primary navigation.
- Role navigation changes content but not the design language.
- A skip link moves keyboard focus to main content.

## 9. Buttons and controls

| Type        | Treatment                                                                |
| ----------- | ------------------------------------------------------------------------ |
| Primary     | Primary accent fill; high-contrast label; one dominant action per region |
| Secondary   | Transparent, structural border, standard text                            |
| Ghost       | Transparent, muted-to-standard text on hover/focus                       |
| Destructive | Restrained error border/text; confirmation for consequential actions     |
| Icon-only   | Familiar action only, accessible name and tooltip                        |

Important or destructive operations use icon plus text. Familiar editor controls may be icon-only if their accessible name and shortcut are exposed.

## 10. Forms

- Persistent visible labels; placeholders do not replace labels.
- Input surface `#101112`, internal border, 4px radius.
- Primary focus border plus a visible 2px focus ring.
- Validation messages connect through `aria-describedby`.
- Errors identify how to correct the value.
- Disabled state remains discernible.
- Submission preserves entered values on recoverable failures.

## 11. Status system

Each status combines a 6px dot or icon, text label, and accessible name.

| Status group   | Labels                                                             |
| -------------- | ------------------------------------------------------------------ |
| Connection     | Connected, Disconnected                                            |
| Execution      | Queued, Running, Successful, Warning, Failed, Timed out, Cancelled |
| Submission     | Draft, Submitted, Grading, Graded, Late, Reopened                  |
| Infrastructure | Healthy, Degraded, Unavailable, Maintenance                        |

Color is supplementary. Live regions announce execution and submission changes without announcing rapidly changing row output.

## 12. Tables and grids

- Sticky headers where the scroll container permits.
- 1px row dividers and subtle hover/selected surfaces.
- Keyboard navigation with a documented grid model.
- Tabular numeric values.
- Sort state is announced and visible.
- Controlled virtualization preserves accessible row/column context.
- Horizontal scrolling is mandatory for wide data.
- Columns are not squeezed below usable width.
- Loading, empty, error, truncated, and permission-denied states are distinct.
- Result truncation is persistent and includes the applied limit.

## 13. Workbench patterns

- Left schema explorer, center editor/results split, optional right context.
- All splitters are keyboard operable and expose current size.
- SQL word wrapping is off by default.
- Editor and result grid scroll horizontally.
- Full-screen editor and results modes are available.
- Destructive confirmation states the parsed action and target object.
- Execution toolbar keeps Run and Cancel in stable positions.
- Messages distinguish SQL error, policy denial, timeout, connectivity, and platform failure.

## 14. Dashboard patterns

- Use compact KPI regions, dense lists, queues, alerts, and meaningful trends.
- Avoid wrapping every item in a card.
- Do not show charts without a defined measure, period, units, and accessible summary.
- Student dashboard prioritizes next activity and personal progress.
- Teacher dashboard prioritizes grading and learner attention.
- Administrator dashboard prioritizes safety, capacity, and service state.

## 15. Accessibility acceptance criteria

- WCAG 2.2 AA automated and manual review.
- Complete keyboard access with logical order and no traps.
- Visible focus under all themes/states.
- Correct landmarks, headings, labels, tables, dialogs, menus, and trees.
- Screen-reader execution announcements.
- Text/control contrast verified against rendered surfaces.
- Status never conveyed by color alone.
- 200% zoom and text resizing remain usable.
- Reduced motion is respected.
- Monaco integration includes accessible editor guidance and a plain-text fallback/review path where necessary.
