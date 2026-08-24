# PWA support + PWA-only bottom navigation

## Context

CodeForge (`apps/web`, Next.js 16.3.1, App Router) currently has no web app manifest, no service worker, and one responsive shell: a persistent left sidebar at `lg:` width and a hamburger-triggered slide-in drawer below it (`apps/web/src/components/app-shell/app-shell.tsx`). The user wants two things bundled into one effort:

1. **Make it installable as a PWA** (manifest, icons, service worker, "Add to Home Screen" support on Android/desktop Chrome and iOS Safari).
2. **A PWA-only UI change**: when the app is running installed/standalone (not in a normal browser tab), replace the mobile hamburger+drawer navigation with a native-app-style **bottom tab bar**. The existing left sidebar stays exactly as-is at desktop/tablet widths (`lg:` and above), installed or not — "and sidebar etc" means keep it for larger surfaces, don't remove it.

The regular browser-tab experience (desktop sidebar, mobile hamburger+drawer) must not change at all. Everything here is additive and gated behind standalone-mode detection.

## Implementation review amendments

The architecture below was checked against the live Serwist Turbopack documentation and the installed package API before implementation. Apply these corrections to the original proposal:

- This repository uses a `src/` layout, so the Serwist worker source is `src/app/sw.ts`, not `app/sw.ts`.
- Generate the offline-page revision from deployment environment metadata with a random build fallback. Do not spawn `git` from the route handler; production builders are not guaranteed to include Git metadata or the Git executable.
- Keep `skipWaiting` disabled for v1. An installed CodeForge window can contain long-lived SQL, compiler, or GUI sessions, so a new service worker must not forcibly take control in the middle of one. The update activates safely after existing clients close.
- Mount `SerwistProvider` with `cacheOnNavigation={false}` and `reloadOnOnline={false}`. Its defaults otherwise warm every client-side route and reload the page when connectivity returns, both of which are unsafe surprises inside an active workspace.
- Treat `/v1`, Next.js RSC/prefetch traffic, and all cross-origin backend traffic as network-only. Only same-origin content-hashed assets, stable public PWA assets, and successful HTML document navigations may enter runtime caches.
- Bound every runtime cache with entry and age limits. Cached document responses are an offline shell convenience, not durable application data.
- The bottom bar must sit below the existing `z-30` drawer backdrop, not merely below the `z-40` drawer panel, so opening **More** covers and disables the entire bar.
- Use short visual labels (`SQL`, `Code`, `ERD`) while retaining the full navigation label as the accessible name; full `* Workspace` labels wrap badly in five phone-width columns.
- Keep `.claude/` and any uncommitted planning documents outside the implementation commit unless explicitly requested.

**Icons already exist from prior work this session** — `apps/web/src/app/icon.png` (256×256 favicon), `apps/web/src/app/apple-icon.png` (180×180), and `apps/web/public/codeforge-mark.png` (256×256, used as the in-app brand mark in the sidebar and on auth pages) were all derived from the source logo at the repo root (`CodeForge.png`, 1254×1254, transparent background, already a padded circular badge) via `sharp`. Reuse that same source for the new manifest icon sizes below — don't ask the user for a new asset.

## Hard constraint: this app runs on Turbopack, not webpack

`apps/web/package.json` scripts are plain `next dev` / `next build` — no `--webpack` flag. Next.js 16 makes **Turbopack the default bundler for both dev and build**, and Turbopack **does not support webpack plugins** (confirmed in the bundled docs at `node_modules/next/dist/docs/01-app/03-api-reference/08-turbopack.md`, "Webpack plugins" section). This rules out `next-pwa`, which is a webpack plugin — installing it would silently no-op under the default `next dev`/`next build` commands (it would only work if scripts wine special-cased to `next build --webpack`, which nobody would notice was required until PWA install just didn't work).

This constraint also affects Serwist: `@serwist/next` (the older, more commonly-documented package) is also webpack-based and requires `next build --webpack`. **Use `@serwist/turbopack` instead** — a genuinely Turbopack-native integration (separate package, actively maintained as of this plan's writing: `@serwist/turbopack` on npm, ~39k weekly downloads). Do not reach for `@serwist/next` or `next-pwa` by habit/muscle memory — verify whichever package you install is the Turbopack one before running `npm install`.

**Before implementing, read the current docs at https://serwist.pages.dev/docs/next/turbo directly** — the exact API surface below (route handler shape, `SerwistProvider` props, `withSerwist` options) was gathered via a secondhand fetch of that page, not read from primary source, and Serwist's Turbopack integration is a young, fast-moving package. Treat the shape described here as "this is the architecture, confirm exact exports/signatures against the live docs," not verbatim gospel.

### What Serwist buys you here, precisely

A hand-written `public/sw.js` cannot correctly precache Next's build output: `/_next/static/*` filenames are content-hashed per build, so there's no fixed list to hardcode, and there's no Turbopack-native way to generate that manifest without a real build-integration package. Serwist solves exactly this (injects `self.__SW_MANIFEST` at build time). Everything else (runtime caching rules, what to exclude, versioning, offline fallback) is still something you configure explicitly — Serwist doesn't make those decisions for you.

### Packages (apps/web)

```
npm install -D @serwist/turbopack esbuild serwist --workspace @sqweb/web
```

### Shape (verify exact names against the live docs before writing code)

- `next.config.ts`: wrap the existing config with `withSerwist` from `@serwist/turbopack` (the file already exports a plain `NextConfig` object — wrap it, don't replace the existing `poweredByHeader`/`reactStrictMode`/`transpilePackages` settings).
- New route handler, something like `apps/web/src/app/serwist/[path]/route.ts`, using `createSerwistRoute` (this is how the Turbopack integration serves the generated worker — it isn't a static `public/sw.js` file the way the classic Serwist/next-pwa setups are).
- New `apps/web/src/app/sw.ts` — the actual service worker source, importing its strategies and types from `serwist`. This is where you configure:
  - `skipWaiting: false`, `clientsClaim: true` — the first worker controls the installed app after activation, while later versions wait until existing CodeForge windows close. This avoids switching application versions in the middle of a live SQL, compiler, or GUI session.
  - `precacheEntries: self.__SW_MANIFEST` — the build-injected list of hashed static assets. This is the piece a hand-rolled SW can't do.
  - `runtimeCaching` — **do not use the library's `defaultCache` preset as-is.** It's tuned for a generic content site, and this app has live execution/session backends that must never be served from cache. Configure explicitly:
    - **Never cache** (network-only, no fallback): anything under `/v1/*` (all of `platform-api`'s REST routes), and any cross-origin request to `execution-api`, `interactive-run-api`, or `gui-execution-api` (WebSocket upgrade requests aren't interceptable by `fetch` handlers anyway, but the grant-issuing HTTP calls that precede them are — those must hit the network live every time). Getting this wrong means a student could see a stale query result, a stale execution grant, or a stale auth state served from cache — flag this prominently to whoever reviews the PR, it's the one mistake here that's actually harmful rather than just a wasted feature.
    - **Cache-first, effectively forever**: `/_next/static/*` — safe because filenames are content-hashed; a new deploy ships new filenames, so there's no staleness risk and no need to ever invalidate these entries manually.
    - **Stale-while-revalidate**: same-origin `/public` static assets not already covered by precache (icons, manifest) — cheap safety net, not load-bearing.
    - **Network-first, falling back to cache, falling back to an offline page**: HTML navigations (`request.mode === "navigate"`). See offline fallback below.
  - `navigationPreload: true` is a reasonable default (lets the browser start the network request for a navigation in parallel with SW startup instead of waiting for it) — keep it unless it causes a specific problem.
- New `apps/web/src/app/offline/page.tsx` — plain static page ("You're offline — reconnect to keep working. Your SQL/code/ERD workspaces need a live connection.") shown when a navigation fails and nothing cached matches. Keep it a static server component, no client data fetching.
- Root layout: wrap children with `SerwistProvider` from `@serwist/turbopack/react` (handles registering the worker client-side — this replaces the hand-rolled "service worker registrar" component you'd otherwise need to write). Set `cacheOnNavigation={false}` and `reloadOnOnline={false}` so provider conveniences do not cache RSC navigation traffic or reload an active workspace when connectivity returns.

### Local verification

`next dev` runs with hot reload and the SW is generally not what you want fighting HMR — test actual PWA/offline behavior via `npm run build && npm run start --workspace @sqweb/web` (or the repo's existing equivalent scripts) and hit `http://localhost:3000` with dev tools' Application panel / Lighthouse, not `next dev`.

### If Serwist's Turbopack integration turns out to be too rough in practice

Fall back to a hand-written `apps/web/public/sw.js` (plain file, no build step) with **runtime-only caching** (no precache of hashed JS/CSS — accept that a fresh browser tab needs one full network fetch of the app shell before anything is cached) using the exact same caching rules laid out above (never cache `/v1/*` or cross-origin execution hosts; cache-first for `/_next/static/*` once fetched; network-first with offline-page fallback for navigations). Register it from a small client component (`navigator.serviceWorker.register("/sw.js")` in a `useEffect`, gated to `process.env.NODE_ENV === "production"`) mounted once in `layout.tsx`. This is strictly worse (no precache, more hand-maintained cache logic) but has zero new dependencies and zero Turbopack-compatibility risk — a reasonable de-scope if Serwist's Turbopack package is unstable when you actually try it.

## Manifest

Use Next's native `app/manifest.ts` file convention (`MetadataRoute.Manifest` return type) — this is a framework-level feature, not a bundler plugin, so it works identically under Turbopack. No new dependency.

New file `apps/web/src/app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CodeForge",
    short_name: "CodeForge",
    description: "Secure browser-based SQL, code, and ERD practice suite",
    start_url: "/",
    display: "standalone",
    background_color: "#070708",
    theme_color: "#070708",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
```

Notes:

- `background_color`/`theme_color` use `#070708` — the app's dark-theme `--canvas` token from `packages/design-system/src/tokens.css` (this is the default theme; the light variant is `#f4f5f7`, handled separately below for the live browser-chrome tint, not in the manifest — the manifest's `theme_color` is a single static value used mainly for the splash screen).
- `start_url: "/"` deliberately reuses the existing root route's own auth-aware redirect logic (`apps/web/src/app/page.tsx`) — don't build a separate PWA entry point.
- **Icon paths must be stable `/public` files, not the `app/icon.png` / `app/apple-icon.png` metadata-route files** — those are served at a content-hashed query string (`/icon.png?icon.<hash>.png`) that changes per build, which is wrong for a manifest a browser caches at install time across future deploys.

### New icon assets needed (derive from root `CodeForge.png` via `sharp`, same pattern already used for `icon.png`/`apple-icon.png`/`codeforge-mark.png` this session)

- `apps/web/public/icon-192.png`, `apps/web/public/icon-512.png` — plain resize, same as the existing `codeforge-mark.png` generation.
- `apps/web/public/icon-maskable-192.png`, `apps/web/public/icon-maskable-512.png` — **not a plain resize.** Android applies an arbitrary shape mask (circle, squircle, rounded-square...) to maskable icons and crops anything outside the center ~80% "safe zone." The source logo is already a circular badge with a ring and "CodeForge" text near the bottom edge — resized directly, a circular mask would clip the wordmark. Composite the logo at ~80% scale onto a solid square canvas using the same dark canvas color as the manifest background:

  ```js
  const sharp = require("sharp");
  const src = "CodeForge.png"; // repo root

  async function makeMaskable(size, safeZonePx) {
    const mark = await sharp(src).resize(safeZonePx, safeZonePx).toBuffer();
    await sharp({
      create: { width: size, height: size, channels: 4, background: "#070708" },
    })
      .composite([{ input: mark, gravity: "center" }])
      .png({ compressionLevel: 9 })
      .toFile(`apps/web/public/icon-maskable-${size}.png`);
  }

  makeMaskable(512, 410); // 410/512 ≈ 80%
  makeMaskable(192, 154); // 154/192 ≈ 80%
  ```

## `layout.tsx` changes

`apps/web/src/app/layout.tsx` currently exports `metadata` only and has a blocking inline script (`themeInitScript`) that sets `data-theme` on `<html>` before hydration to avoid a flash of the wrong theme. Two additions, both following that same "avoid a flash" pattern:

1. Add an `appleWebApp` field to the existing `metadata` export:

   ```ts
   export const metadata: Metadata = {
     title: "CodeForge",
     description: "Secure browser-based SQL, code, and ERD practice suite",
     appleWebApp: {
       capable: true,
       title: "CodeForge",
       statusBarStyle: "black",
     },
   };
   ```

   Use `statusBarStyle: "black"` (opaque black status bar), **not** `"black-translucent"`. Translucent draws page content underneath the iOS status bar/notch, which requires `viewportFit: "cover"` plus `env(safe-area-inset-top)` padding threaded through the header to avoid text sitting under the notch — real extra work with a real class of bugs if missed. `"black"` gives a solid bar matching the app's dark canvas color with zero extra inset plumbing. Don't add `viewportFit: "cover"` / top safe-area handling as part of this plan; it's a reasonable follow-up if the team wants the full edge-to-edge look later, but keep v1 scope tight to what's needed (bottom-bar safe area, covered below, is unavoidable — the notch isn't).

2. Add a `viewport` export (separate from `metadata` — the Metadata API split `themeColor`/`viewportFit` etc. out into their own `Viewport` type in Next 14+):

   ```ts
   import type { Metadata, Viewport } from "next";

   export const viewport: Viewport = {
     themeColor: "#070708",
   };
   ```

   **Do not** use the `themeColor: [{ media: "(prefers-color-scheme: light)", ... }, { media: "(prefers-color-scheme: dark)", ... }]` array form that Next's own docs show as the typical example. That form tracks the OS-level `prefers-color-scheme`, but this app's theme is a **manual** toggle stored in `localStorage` (`sqweb-theme`, see `apps/web/src/components/theme/theme-provider.tsx`) that's independent of OS preference — a user could have the OS in dark mode and the app manually set to light. Two competing static `media`-conditioned meta tags can't express "whatever the app's manual state currently is." Instead:
   - The static `viewport.themeColor` above renders one unconditional `<meta name="theme-color">` matching the app's default theme (dark) for the very first paint.
   - Extend the existing blocking `themeInitScript` in this same file to also correct that meta tag's `content` synchronously if the stored preference is `"light"` — mirrors exactly what the script already does for `data-theme`, same reasoning (avoid a flash, before hydration, no `window`/`localStorage` on the server).
   - Extend `theme-provider.tsx`'s `applyTheme()` function (the single place that already sets `data-theme` on every toggle) to also update the `theme-color` meta's `content` on every manual theme change, so the OS status bar / browser chrome tint stays in sync with the in-app toggle for the rest of the session, not just first paint.

   Concretely, in `theme-provider.tsx`:

   ```ts
   const THEME_COLOR: Record<Theme, string> = {
     dark: "#070708",
     light: "#f4f5f7",
   };

   function applyTheme(theme: Theme) {
     document.documentElement.setAttribute("data-theme", theme);
     document
       .querySelector('meta[name="theme-color"]')
       ?.setAttribute("content", THEME_COLOR[theme]);
     window.localStorage.setItem(STORAGE_KEY, theme);
     window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
   }
   ```

3. If going the Serwist route above: wrap `{children}` in `<SerwistProvider>` per its docs. If going the hand-rolled fallback: mount the small service-worker-registrar client component instead.

## Part 2: PWA-only bottom navigation bar

### Standalone-mode detection

New hook, `apps/web/src/lib/use-standalone-display-mode.ts`. The codebase already has precedent for exactly this technique — `window.matchMedia(...)` is already used for responsive JS behavior in `apps/web/src/components/code-workbench/code-editor.tsx` and `apps/web/src/components/workbench/sql-editor.tsx` (both check `"(max-width: 1023px)"` to toggle Monaco's word-wrap). Follow the same shape:

```ts
"use client";

import { useEffect, useState } from "react";

export function useStandaloneDisplayMode(): boolean {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(display-mode: standalone)");
    const update = () =>
      setIsStandalone(
        query.matches ||
          // iOS Safari's legacy flag — display-mode media query support
          // there is inconsistent across iOS versions, this is the reliable check.
          (navigator as unknown as { standalone?: boolean }).standalone ===
            true,
      );
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isStandalone;
}
```

Defaults to `false` so server render and first client render match exactly (no hydration mismatch) — the real value lands one effect tick after mount, which means the very first frame of a standalone launch briefly shows the "browser" shell before flipping to the bottom-bar layout. That flash is normal for this technique (there's no way to know `display-mode` before the client has a `window`) and not worth fighting with `useLayoutEffect` tricks — it's ~one frame.

**Testing gotcha**: jsdom does not implement `window.matchMedia` — there's no existing polyfill for it anywhere in this repo (`apps/web/src/test/setup.ts` only handles `@testing-library/jest-dom` + `cleanup()`; the two existing components that call `matchMedia` have no test files exercising that code path, so this has never actually been hit yet). Add a minimal mock either globally in `src/test/setup.ts` (affects all tests, simplest — a `MediaQueryList`-shaped stub with `matches`, `addEventListener`/`removeEventListener` no-ops) or locally in this hook's own test file. Prefer the global setup file since a second consumer (the bottom nav bar itself, or its test) will need it too.

### `apps/web/src/components/app-shell/bottom-nav-bar.tsx`

New client component. Props: `role: Role`, `activeHref: string`, `moreOpen: boolean`, `onMoreClick: () => void`.

- Fixed to the bottom: `fixed inset-x-0 bottom-0 z-[25] border-structural bg-canvas/95 border-t backdrop-blur-xl` (the app already uses a `z-30` mobile backdrop and `z-40` sidebar; keeping the bar below both makes the entire bar inert and visually covered while **More** is open).
- `lg:hidden` — hidden at desktop width exactly like the existing hamburger/drawer are today; the difference is this component is only mounted at all when `useStandaloneDisplayMode()` is true (see app-shell wiring below), not present in the DOM otherwise.
- Bottom padding must account for the iOS home-indicator safe area so the tab bar doesn't sit under it: `pb-[env(safe-area-inset-bottom)]` on the outer bar element (Tailwind arbitrary value; this env() var evaluates to `0px` on platforms without a safe-area inset, so it's a no-op on Android/desktop).
- Content: `roleNavigation[role].slice(0, 4)` (see item-count rationale below) rendered as `Link`s, each with icon + small label, `aria-current="page"` when `href === activeHref`; plus a 5th fixed "More" button (lucide `MoreHorizontal` icon) that calls `onMoreClick` instead of navigating. Highlight it while the drawer is open or when `activeHref` doesn't match any of the first four hrefs, so the visible navigation state is always clear.
- `aria-label="Primary"` on the `<nav>` element (distinct from the sidebar's existing `aria-label={`${roleLabels[role]} navigation`}` landmark, since — see below — both can exist in the tree, just not both visible, and two landmarks can't share a label).

**Why slice to 4, not show everything**: `roleNavigation` in `apps/web/src/components/app-shell/navigation.ts` has 6 items for `student`, 9 for `teacher`, 7 for `administrator` — a flat bottom bar tops out around 5 slots before it stops being usable on a phone-width screen. Don't add a new "priority" field to `NavigationItem` to hand-curate which 4 matter most per role — `slice(0, 4)` (array order already roughly reflects importance: Dashboard first, workspaces next) plus "More" for the rest is enough for v1 and avoids maintaining a second parallel config that can drift from the real nav list.

**Reuse the existing drawer as the overflow sheet — don't build a second nav list UI.** `app-shell.tsx`'s existing `aside` (the slide-in drawer, currently opened by the header hamburger on mobile) already renders every item in `roleNavigation[role]`, handles active-state styling, and is already tested. "More" should just call the exact same `setIsMobileOpen(true)` the hamburger button calls today — same drawer, same state, new trigger location. Do not fork a second "MoreSheet" component that duplicates the drawer's item list.

### `app-shell.tsx` wiring

In `apps/web/src/components/app-shell/app-shell.tsx`:

1. `const isStandalone = useStandaloneDisplayMode();`
2. The header's hamburger button (`<Menu>` icon, `onClick={() => setIsMobileOpen(true)}`, currently always rendered with `lg:hidden` styling) should only render **when `!isStandalone`**. When standalone, mobile-width primary navigation moves to the bottom bar entirely — the header keeps just the page title, notifications, and theme toggle (a native-app top bar), no menu icon. (At `lg:` width the sidebar is always visible regardless of standalone state, so the hamburger is irrelevant there either way — this change only has a visible effect below `lg:`.)
3. Render `<BottomNavBar role={role} activeHref={activeHref} moreOpen={isMobileOpen} onMoreClick={() => setIsMobileOpen(true)} />` immediately after the existing `aside` block, gated on `isStandalone`.
4. The existing `aside` drawer element is untouched functionally — it's still opened/closed via the same `isMobileOpen` state, just now has two possible triggers (hamburger when not standalone, "More" tab when standalone) instead of one.
5. The scrollable content area (wherever `{children}` renders inside the `<div className="flex min-w-0 flex-1 flex-col">` wrapper, below the `<header>`) needs reserved bottom padding when the bottom bar is showing, or the last bit of every page's content sits underneath it: add `pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0` conditionally when `isStandalone` (the `lg:pb-0` half cancels it back out at desktop width, where the bar isn't rendered anyway — belt and suspenders, keep it for correctness if this class ever gets reused). 4rem (64px) should roughly match the bar's actual rendered height — measure once the bar is built and adjust the constant instead of guessing.

### Scope check — where this does and doesn't apply

`apps/web/src/components/app-shell/app-shell.tsx` is only used by the authenticated student/teacher/admin dashboards. The auth screens (login, register, forgot-password, verify-email, pending-approval, account-unavailable, continue) render through `apps/web/src/components/auth/identity-frame.tsx`, which has no sidebar/header/nav at all — nothing to change there, bottom bar doesn't apply to unauthenticated screens.

## Out of scope for v1 (flag explicitly, don't build silently)

- No custom "Install CodeForge" prompt UI (capturing `beforeinstallprompt` on Chrome/Android, manual "Add to Home Screen" instructions for iOS Safari which has no such event). Browsers already offer a native install affordance once the manifest + service worker criteria are met; a custom prompt is a nice-to-have polish item, not required for installability.
- No "new version available, tap to refresh" toast wired to SW `updatefound`/`controllerchange` events. Updated workers activate after existing app windows close; a user-directed update toast can be added later if immediate upgrades become important.
- No `viewportFit: "cover"` / edge-to-edge iOS status bar handling (see `statusBarStyle: "black"` reasoning above) — deliberately deferred, opaque status bar is correct and sufficient for v1.
- No per-role hand-curated "primary 4" nav config — `slice(0, 4)` is the v1 rule, see reasoning above.
- No offline execution of any kind (SQL runs, code runs, ERD saves) — everything in the service worker's caching scope is app-shell/static-asset caching for faster/offline-tolerant _loading_, never a substitute for the live backends. Re-read the "never cache" list above before adding any caching rule that touches `/v1/*` or a workspace backend host.

## Verification steps

1. `npm run typecheck --workspace @sqweb/web` and existing test suite (`npm run test --workspace @sqweb/web`) stay green — especially `app-shell.test.tsx`, which will need new assertions/mocks for the standalone-mode hook (mock `useStandaloneDisplayMode` the same way the file already mocks `useAuth`/`useTheme`/`next/navigation`, rather than trying to drive real `matchMedia` state through it).
2. `npm run build --workspace @sqweb/web && npm run start --workspace @sqweb/web`, then in Chrome DevTools → Application panel: confirm the manifest is detected with no icon/purpose warnings, confirm a service worker is registered and activated, run Lighthouse's PWA/installability audit.
3. Manually install the app (desktop Chrome's install icon in the address bar, or Android "Add to Home Screen") and confirm: standalone window has no browser chrome, bottom bar appears at phone width with the sidebar still appearing at wider widths, "More" opens the existing drawer, status bar area (Android) / title bar (desktop) picks up the dark theme color, toggling the in-app theme updates it live.
4. Turn off networking after the app has loaded once and confirm a navigation to an already-visited route still renders the shell (even if workspace data itself can't load without a connection) instead of the browser's offline error page.
