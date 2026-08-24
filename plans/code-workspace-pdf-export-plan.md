# Code Workspace per-file PDF export

## Review amendments

- Snapshot the active file, author, export time, and transcript at click time so
  asynchronous generation cannot mix later UI changes into the PDF.
- Associate Console output with the file ID and source snapshot that produced
  it. If the student switches files or edits the source after a run, do not
  attach stale output to the current code; show `(not run yet)` instead.
- Preserve logical source/transcript newlines and blank lines. Wrap only an
  individual line that exceeds the printable width.
- Render stdin, stderr, and status entries with small textual prefixes so the
  chronological transcript remains understandable in a monochrome printout.
- Sanitize Windows-invalid filename characters, retain the activity file's
  extension, and guard against duplicate export clicks.
- Reserve footer space during pagination, then add the file name and `Page X of
Y` after the total page count is known.
- Mobile download behavior, especially whether a given iOS Safari version opens
  the generated PDF in a tab, requires a real-device manual check; automated
  browser tests can verify generation but not that OS-level behavior.

## Output

Export only the currently active code file. The PDF contains:

1. A first-page header with Author, Date & Time, and Activity (the file name).
2. The active file's complete source code in built-in Courier.
3. A fresh-page Program Output section containing the ordered Console
   transcript, or `(not run yet)` when no matching run exists.
4. A footer on every page containing the file name and page numbering.

Use Philippine Long bond paper in portrait orientation:

```ts
new jsPDF({ orientation: "portrait", unit: "in", format: [8.5, 13] });
```

## Implementation

- Add `apps/web/src/components/code-workbench/code-pdf-export.ts` with reusable
  wrapping, pagination, transcript formatting, footer, and filename logic.
- Add an Export PDF toolbar action to `code-workbench.tsx`, disabled without an
  active file or while another export is being generated.
- Use `useAuth().account?.displayName ?? "Unknown"` for the author.
- Track the file/source snapshot when an interactive run begins.
- Surface PDF generation failures in the existing toolbar status area.

## Verification

- Unit-test custom page dimensions, metadata, filename sanitization, blank-line
  preservation, transcript ordering, fresh output page, multi-page source, and
  page footers.
- Run web formatting, typecheck, lint, tests, and production build.
- Manually test download/open behavior on desktop and a real iOS Safari device.

## Out of scope

- Exporting every file or a folder in one batch.
- Persisting a separate activity-name field.
- Server-side PDF storage or submission workflows.
