# Interactive stdin for Code Compiler

## Review amendments implemented

- Initiate the container attach request before `start()` and await them together.
  The private handshake keeps the entrypoint blocked until output listeners are
  ready, so early prompts and compile errors cannot be missed and Docker Desktop
  cannot deadlock while waiting for the container to start.
- Use `stdbuf -o0 -e0` for C/C++; line buffering still hides prompts without a
  newline.
- Use `NetworkMode: "none"`. Interactive compiler runs require no network, so a
  non-internal bridge would unnecessarily permit outbound access.
- Mount `/tmp` as a bounded executable tmpfs; compiled C/C++ binaries cannot run
  from Docker Desktop's default non-executable tmpfs.
- Consume a deterministic Docker attach handshake before launching student code.
  docker-modem otherwise forwards its attach request body into container stdin.
- Enforce a 10-second first-message timeout, per-frame/cumulative input limits,
  a 1 MiB output cap, and one-time in-process grant nonce consumption.

## Context

The Code Compiler workspace (`apps/web/src/components/code-workbench/code-workbench.tsx`) currently runs code through Judge0 (`apps/execution-api/src/code-judge-client.ts`), which submits source + a single stdin blob in one request (`wait=true`) and returns final stdout/stderr after the whole run finishes. A program that calls `Scanner.nextLine()` (or `input()`, `scanf`, etc.) multiple times can't be driven this way — all input has to be pre-typed into one textarea, in order, before Run is even clicked. That's the "separated input" hassle the user wants fixed: they want to click Run, see the program's prompt appear, type the answer, hit enter, and see the next prompt — a real back-and-forth console, not a batch submission.

Judge0 is architecturally incapable of this (it's a batch judge API, no live channel back into the running process). The Code Workspace therefore uses a real container with a live process whose stdin/stdout are piped over a WebSocket in real time.

**Decisions made with the user before writing this plan:**

1. **Lightweight, on-connect provisioning** — no new DB table, no new always-on provisioning-worker process. A container is created synchronously the moment the run WebSocket's first message arrives, and torn down when the run ends or the socket closes. A hard per-run timeout plus a label-based sweep (see "Known gaps" below) is the safety net, not a DB-tracked reaper. This mirrors the _shape_ of the Java GUI Workspace (`packages/gui-session`, `apps/gui-provisioning-worker`, `apps/gui-execution-api`) but collapses provisioning-worker + execution-api into one small new service, since there's no pool/session bookkeeping needed for a run that only lives as long as one WebSocket connection.
2. **Interactive-only Code Workspace** — after implementation review, the user chose to remove the separated stdin/batch controls. The single "Run" button and editor shortcut now open the live console. The shared batch execution backend remains available for compatibility but is no longer invoked by this workspace UI.

## Architecture

```
Browser (code-workbench.tsx)
   │ 1. POST /v1/interactive-run-grants   (via platform-api, Firebase-authenticated)
   │    → { token }  (short-lived HMAC grant, ~like a GUI session grant)
   │
   │ 2. new WebSocket(`${INTERACTIVE_RUN_API_URL}/v1/interactive-runs?token=...`)
   │ 3. first frame sent: {"type":"start","language":"python","sourceCode":"..."}
   ▼
apps/interactive-run-api  (new, Fastify + @fastify/websocket + dockerode)
   │ verifies grant → writes sourceCode to a temp dir → docker createContainer
   │ (image: code-runtime) → initiate attach + start → release private handshake
   │ demuxes stdout/stderr → forwards as WS frames
   │ forwards client "stdin" frames straight into the container's stdin pipe
   │ hard timeout → container.stop(); WS close → container.stop()+remove()
   ▼
Docker container (infrastructure/docker/code-runtime image)
   entrypoint.sh: compile if needed, then exec the interpreter/binary as PID 1
```

## New Docker image: `infrastructure/docker/code-runtime/`

Mirrors `infrastructure/docker/gui-runtime/` (`Dockerfile` + `entrypoint.sh`) but with no Xvfb/fluxbox/x11vnc/websockify — this is a plain headless runtime, one combined image covering all 5 existing `CodeLanguage` values (`python`, `java`, `cpp`, `javascript`, `c`) so there's exactly one image to build/push, matching the languages Code Compiler already supports.

- Base: `eclipse-temurin:21-jdk-jammy` (same base gui-runtime already uses — gives Java for free, Jammy's `apt` gets everything else).
- `apt-get install -y --no-install-recommends python3 gcc g++ nodejs coreutils` (`coreutils` provides `stdbuf`, used below).
- Same non-root convention as gui-runtime: `useradd -u 10001 -m -s /usr/sbin/nologin student`, `chown` a `/workspace/src` dir, `USER student`.
- `entrypoint.sh` reads `LANGUAGE` env var and a fixed per-language entry filename (the source is bind-mounted read-only at `/workspace/src/<entry-file>` by the caller, same pattern as `DockerGuiContainerAdmin.provision`'s `Binds: [...:/workspace/src:ro]`):
  - `java`: filename **must** be `Main.java` (this reuses Judge0's own convention — Judge0 already requires `public class Main` for Java submissions today, so interactive mode imposes nothing new). `javac -d /tmp/out /workspace/src/Main.java` (exit `42` on failure, same distinctive code gui-runtime already uses for "tell compile failure apart from a runtime crash") then `exec java -cp /tmp/out Main`.
  - `python`: `main.py` → `exec python3 -u /workspace/src/main.py` (`-u` = unbuffered stdio — see gotcha below, this flag is _required_, not optional).
  - `c`: `main.c` → `gcc -O2 -o /tmp/out/a.out /workspace/src/main.c` (exit 42 on fail) → `exec stdbuf -o0 -e0 /tmp/out/a.out`.
  - `cpp`: `main.cpp` → same via `g++`.
  - `javascript`: `main.js` → `exec node --require /usr/local/lib/node-interactive-preload.cjs /workspace/src/main.js`; the preload makes Node 12 release Docker's still-open stdin pipe after the student's `readline` interface closes.
  - `exec` for the final process (not a subshell call) is load-bearing, same reason the existing entrypoint comment gives: it makes the interpreter/binary PID 1 so SIGTERM (hard timeout / Stop button) reaches it directly.

**⚠️ Real gotcha to flag to Codex explicitly (this will silently break the whole feature if missed):** stdout is **block-buffered by libc when not attached to a TTY** for Python and C/C++ — a `print()`/`printf()` prompt written right before a blocking read call will sit in an internal buffer and never actually reach the WebSocket until thousands of bytes accumulate or the process exits. The console would appear frozen with no prompt showing, exactly the bug this feature exists to fix. Mitigation is already baked into the entrypoint design above: Python gets `-u`, C/C++ get wrapped in `stdbuf -o0 -e0` (fully unbuffered, including prompts without a newline). Java and Node need no wrapper, but all five languages are verified by the real Docker smoke script.

## New backend service: `apps/interactive-run-api`

New Fastify app (`server.ts` + `main.ts`, mirrors `apps/gui-execution-api`'s shape closely — reuse its structure as the template, not a blank slate):

- `@fastify/websocket` registered, one route: `GET /v1/interactive-runs` (`{ websocket: true }`).
- Constructor dependencies: `grantSigner: ExecutionGrantSigner`, an `InteractiveRunManager` (the production implementation uses `dockerode`), and runtime/output limits.
- On connect: verify `?token=` via a new `grantSigner.verifyInteractiveRun(token)` (see grant section below); close with `4401` if invalid, same convention `gui-execution-api` uses.
- Wait for the **first** WS message, parse as JSON against a new zod schema (see contracts section) requiring `{type:"start", language: CodeLanguage, sourceCode: string}` — cap `sourceCode` at 100,000 chars, same limit `codeExecutionRequestSchema` already enforces for Judge0 submissions. Close with a WS error frame + `4400` if the first message isn't a valid `start` frame (e.g. arrives late, or malformed).
- Provisioning (new; **not** a reuse of `DockerGuiContainerAdmin` since there's no VNC/websockify port and no DB row, but copy its resource-limit shape verbatim):
  1. `mkdtemp` + write the one source file under the fixed per-language name from the entrypoint's table above.
  2. `docker.createContainer({ Image: codeRuntimeImageTag, Env: ["LANGUAGE=<lang>"], OpenStdin: true, StdinOnce: false, Tty: false, HostConfig: { Binds: ["<tmpdir>:/workspace/src:ro"], Memory, NanoCpus, PidsLimit: 128, ReadonlyRootfs: true, Tmpfs: {"/tmp":"rw,exec,nosuid,size=64m,mode=1777"}, CapDrop: ["ALL"], NetworkMode: "none" }, User: "10001:10001", Labels: { "sqweb.interactive-run": "true" } })`.
  3. Initiate `container.attach(...)`, start the container concurrently, and await both. The entrypoint blocks on the unterminated deterministic handshake body during startup, avoiding Docker Desktop's attach/start deadlock without letting student code run early.
  4. Install stdout/stderr demux listeners, then terminate the handshake line so the entrypoint can launch student code.
  5. Forward demuxed stdout/stderr chunks as `{"type":"stdout","data":...}` / `{"type":"stderr","data":...}` WS frames.
  6. On each client `{"type":"stdin","data":...}` frame, write `data` straight to the writable half of the attach stream.
  7. `setTimeout` for the hard runtime cap (reuse the same constant as `maxRuntimeSeconds` in gui-session, e.g. default a few minutes) → on fire, send `{"type":"error","message":"Time limit exceeded"}` then `container.stop({t:2})`.
  8. On the attach stream ending (process exited) → `container.wait()` for the exit code → send `{"type":"exit","exitCode":N}` → `container.remove({force:true})` → clean up the temp dir.
  9. On WS close from the browser (tab closed / Stop clicked) before natural exit → immediately `container.stop({t:2}).catch(()=>{})` + `container.remove({force:true}).catch(()=>{})` + temp dir cleanup, same fast-path-on-disconnect pattern `gui-execution-api`'s `vnc`/`console` handlers already use in their own `socket.once("close", ...)`.
- **Known gap, explicitly accepted (matches the "lightweight" choice):** if the `interactive-run-api` process itself crashes mid-run, there's no DB row for anything to reap — the orphaned container's own hard-timeout timer died with the process. Mitigation: on startup and every few minutes, list containers with `Labels: {"sqweb.interactive-run":"true"}` via `docker.listContainers({filters:{label:["sqweb.interactive-run=true"]}})` and force-remove any older than ~2× the max runtime (`Created` timestamp from `container.inspect()`). This is maybe 15–20 lines, cheap enough to include even though the DB-backed reaper was declined — it closes the actual crash-orphan gap without the DB/worker machinery.
- Network isolation: use Docker's `none` network. Unlike the GUI runtime, this
  container exposes no port and needs no service-to-container connection.

## `platform-api`: grant-issuing endpoint

New route `POST /v1/interactive-run-grants` (mirrors `GuiSessionService.createSession`'s auth/lock-check shape, but with none of the DB/session-row/audit-record machinery since there's no session to persist):

```ts
server.post("/v1/interactive-run-grants", async (request) => {
  const identity = await verify(request);
  const actor = await identityService.requireActiveAccount(identity, [
    "student",
    "teacher",
  ]);
  await sectionsService.assertWorkspaceUnlocked(identity, "code-compiler");
  const { token } = grantSigner.issueInteractiveRun(
    actor,
    INTERACTIVE_RUN_GRANT_LIFETIME_SECONDS,
  );
  return { token };
});
```

Respecting `assertWorkspaceUnlocked("code-compiler")` here is important — it's the _same_ lock institution admins already apply to the Code Compiler workspace kind, and interactive mode is still the Code Compiler feature, just a new execution path. Don't let it bypass the lock.

## `packages/execution`: new grant kind

In `packages/execution/src/types.ts`, add `InteractiveRunGrantPayload` (copy `GuiSessionGrantPayload`'s shape minus `sessionId` — just `kind: "interactive-run"`, `uid`, `accountId`, `institutionId`, `issuedAt`, `expiresAt`, `nonce`). In `grant-signer.ts`, add `issueInteractiveRun`/`verifyInteractiveRun`, copied directly from `issueGuiSession`/`verifyGuiSession` (`grant-signer.ts:151-184`) — same "no separate uid to cross-check, the HMAC signature is the sole trust boundary" reasoning applies identically (native WebSocket still can't set headers).

## `packages/contracts`: WS message schemas

New file `packages/contracts/src/interactive-run.ts` (or extend `code-execution.ts` — either is fine, prefer a new file since these are WS frame shapes, not HTTP request/response shapes):

```ts
export const interactiveRunClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start"),
    language: codeLanguageSchema,
    sourceCode: z.string().min(1).max(100_000),
  }),
  z.object({ type: z.literal("stdin"), data: z.string() }),
]);
export const interactiveRunServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stdout"), data: z.string() }),
  z.object({ type: z.literal("stderr"), data: z.string() }),
  z.object({ type: z.literal("exit"), exitCode: z.number() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
```

Both apps import these — `interactive-run-api` for server-side parsing/emitting, `code-workbench`'s new console component for client-side parsing.

## Frontend: `apps/web/src/components/code-workbench/`

- New `lib` helper `apps/web/src/lib/interactive-run-url.ts`, copy `gui-execution-url.ts`'s shape exactly: reads `NEXT_PUBLIC_INTERACTIVE_RUN_API_URL`, exports `interactiveRunSocketUrl(token: string)`.
- The single "Run" button in `code-workbench.tsx` starts interactive execution. The editor run shortcut uses the same action. On click:
  1. `authorizedFetch("/v1/interactive-run-grants", { method: "POST" })` → `{ token }`.
  2. Open `new WebSocket(interactiveRunSocketUrl(token))`.
  3. On open, send `{"type":"start", language: activeFile.language, sourceCode: activeFile.sourceCode}`.
  4. Stream output into the always-visible Console panel. There is no separate stdin textarea or batch Output tab.
- New component `interactive-console.tsx`: a scrolling transcript (reuse `OutputPanel`'s `<pre>` styling conventions — stdout plain, stderr in `text-danger`) plus a single `<input>` pinned at the bottom. On Enter: append the typed line to the transcript (so the student sees what they typed, like a real terminal echoing input) and send `{"type":"stdin", data: value + "\n"}`. This is a **line-buffered console, not a full PTY terminal** (no cursor movement, no ANSI, no `xterm.js` dependency) — deliberately, since the user's own description of the desired behavior ("read the question, stop, we write the answer, continue") is exactly a line-buffered request/response console, not raw-mode terminal editing. Keep it simple.
- On receiving `{"type":"exit"}` or `{"type":"error"}`, disable the input line and show a terminal status line (exit code / error message), and close the socket.
- A "Stop" button while a run is active just closes the WebSocket — the server's `socket.once("close", ...)` handler (see above) does the actual container teardown, same fast-path pattern GUI workspace already relies on.

## Explicitly out of scope for v1 (flag these, don't silently skip)

- No execution-history recording for interactive runs. Worth adding later, skipped here to keep the new service DB-free as decided.
- No Ctrl+C / SIGINT support (only a hard timeout kills a runaway `while(true)`). Feasible later via a `{"type":"signal"}` client frame → `container.kill("SIGINT")`, not needed for v1.
- No raw terminal semantics (arrow-key history, backspace-across-lines, colors) — deliberate, see above.
- No multi-file interactive runs — matches Code Compiler's existing single-active-file submission model (`code-workbench.tsx:471-478` only ever sends `activeFile.sourceCode`), not a new restriction.

## Local dev wiring

- `infrastructure/docker/code-runtime/`: build locally the same way gui-runtime presumably is (check for an existing build script/`docker build` convention referenced in gui-runtime's dev docs; if none exists beyond manual `docker build -t sqweb/code-runtime .`, follow that same manual convention).
- Root `package.json`: add `"dev:interactive-run:local": "tsx --env-file=apps/interactive-run-api/.env.local apps/interactive-run-api/src/main.ts"`, following the exact existing naming convention (`dev:gui-execution:local` etc. at `package.json:23`).
- New `apps/interactive-run-api/.env.local.example` (mirrors `apps/gui-execution-api`'s) with `SQWEB_EXECUTION_GRANT_SECRET`, `PORT`, `CODE_RUNTIME_IMAGE_TAG`.
- `apps/web/.env.local`: add `NEXT_PUBLIC_INTERACTIVE_RUN_API_URL`.
- Consider a `scripts/smoke-interactive-run-local.ts`, following the exact shape of `scripts/smoke-gui-execution-local.ts` — open a real WS against a real container, send a scripted multi-prompt Python program (`name = input(...); age = input(...)`), assert the prompts arrive _before_ the corresponding stdin is sent (proves the buffering fix actually works, not just "the program ran"), assert final stdout contains both echoed values.

## Verification

1. `docker build` the new `code-runtime` image locally; manually `docker run -it` it once per language with a trivial "print, read, print" program piped through a real terminal, to sanity-check the buffering fix per-language before any app code exists (same "verify the primitive standalone before building orchestration around it" order Phase 1 of the GUI Workspace plan used).
2. Build `interactive-run-api`, run the new smoke script against real Docker Desktop — proves grant rejection, live back-and-forth stdin/stdout, timeout enforcement, and disconnect cleanup, all against a real container (not mocks) — same bar `smoke-gui-execution-local.ts` already set.
3. Click-test in a real browser: open Code Compiler, write a small Python/Java program that calls `input()`/`Scanner` twice, click "Run", confirm each prompt appears before you type the answer (this is the actual bug being fixed — don't skip this manual check even if the smoke script passes).
4. `npm run typecheck && npm run lint && npm run test && npm run build` across the monorepo before calling it done.
