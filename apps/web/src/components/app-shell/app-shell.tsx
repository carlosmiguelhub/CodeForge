"use client";

import type { Role } from "@sqweb/contracts";
import {
  Bell,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { BottomNavBar } from "./bottom-nav-bar";
import { roleLabels, roleNavigation } from "./navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useStandaloneDisplayMode } from "@/lib/use-standalone-display-mode";

interface AppShellProps {
  readonly role: Role;
  readonly activeHref: string;
  readonly pageTitle: string;
  readonly eyebrow: string;
  readonly children: ReactNode;
}

const SIDEBAR_COLLAPSE_KEY = "sqweb-sidebar-collapsed";

function readStoredCollapse(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "true";
  } catch {
    // Storage can be unavailable (private browsing) — the sidebar still
    // collapses for this page, it just won't persist across navigation.
    return false;
  }
}

export function AppShell({
  role,
  activeHref,
  pageTitle,
  eyebrow,
  children,
}: AppShellProps) {
  // Every page wraps its own content in a fresh AppShell, so a plain
  // useState here would reset to expanded on every sidebar-link navigation
  // (new component instance). Reading localStorage synchronously on mount
  // keeps the collapsed state stable across those remounts.
  const [isCollapsed, setIsCollapsed] = useState(readStoredCollapse);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const isStandalone = useStandaloneDisplayMode();
  const { account, signOut } = useAuth();
  const router = useRouter();
  const initial = (
    account?.displayName.slice(0, 1) ?? roleLabels[role].slice(0, 1)
  ).toUpperCase();

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setIsSigningOut(false);
      setIsMobileOpen(false);
    }
  }

  return (
    <div className="bg-canvas text-ink h-dvh overflow-hidden">
      <a
        href="#main-content"
        className="rounded-control bg-action fixed top-2 left-2 z-50 -translate-y-20 px-3 py-2 font-semibold text-white transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>

      {isMobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/65 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setIsMobileOpen(false)}
        />
      ) : null}

      <div className="flex h-dvh overflow-hidden">
        <aside
          id="primary-navigation"
          className={`border-structural bg-sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r transition-[width,transform] duration-[180ms] lg:static lg:translate-x-0 ${
            isMobileOpen ? "translate-x-0" : "-translate-x-full"
          } ${isCollapsed ? "lg:w-16" : "lg:w-64"}`}
        >
          <div className="border-divider flex h-14 items-center gap-3 border-b px-3">
            <span className="grid size-8 shrink-0 place-items-center">
              <Image
                src="/codeforge-mark.png"
                alt=""
                width={32}
                height={32}
                className="size-8"
                priority
              />
            </span>
            <div className={`min-w-0 flex-1 ${isCollapsed ? "lg:hidden" : ""}`}>
              <p className="font-heading text-ink-primary truncate text-[15px] font-semibold tracking-[-0.02em]">
                CodeForge
              </p>
              <p className="text-ink-muted truncate text-[11px]">
                SQL, code &amp; ERD practice
              </p>
            </div>
            <button
              type="button"
              className="rounded-control text-ink-muted hover:bg-elevated hover:text-ink-primary grid size-8 place-items-center lg:hidden"
              aria-label="Close navigation"
              onClick={() => setIsMobileOpen(false)}
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>

          <nav
            aria-label={`${roleLabels[role]} navigation`}
            className="flex-1 overflow-y-auto p-2"
          >
            <ul className="space-y-1">
              {roleNavigation[role].map((item) => {
                const Icon = item.icon;
                const isActive = item.href === activeHref;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      title={isCollapsed ? item.label : undefined}
                      className={`group rounded-control flex min-h-9 items-center gap-3 border px-2 text-[13px] transition-colors duration-120 ${
                        isActive
                          ? "border-structural bg-elevated text-ink-primary"
                          : "text-ink-muted hover:bg-surface hover:text-ink border-transparent"
                      } ${isCollapsed ? "lg:justify-center" : ""}`}
                      onClick={() => setIsMobileOpen(false)}
                    >
                      <span className="relative grid size-5 shrink-0 place-items-center">
                        {isActive ? (
                          <span className="bg-action absolute -left-[11px] h-4 w-0.5 rounded-full" />
                        ) : null}
                        <Icon aria-hidden="true" size={16} strokeWidth={1.7} />
                      </span>
                      <span className={isCollapsed ? "lg:hidden" : ""}>
                        {item.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="border-divider space-y-1 border-t p-2">
            <button
              type="button"
              className={`rounded-control text-ink-muted hover:bg-surface hover:text-ink hidden h-9 w-full items-center gap-3 px-2 text-xs lg:flex ${
                isCollapsed ? "justify-center" : ""
              }`}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!isCollapsed}
              onClick={() =>
                setIsCollapsed((current) => {
                  const next = !current;
                  try {
                    window.localStorage.setItem(
                      SIDEBAR_COLLAPSE_KEY,
                      String(next),
                    );
                  } catch {
                    // Storage can be unavailable (private browsing) —
                    // collapse still toggles, it just won't persist.
                  }
                  return next;
                })
              }
            >
              {isCollapsed ? (
                <PanelLeftOpen aria-hidden="true" size={16} />
              ) : (
                <PanelLeftClose aria-hidden="true" size={16} />
              )}
              <span className={isCollapsed ? "hidden" : ""}>
                Collapse sidebar
              </span>
            </button>
          </div>
        </aside>

        {isStandalone ? (
          <BottomNavBar
            role={role}
            activeHref={activeHref}
            moreOpen={isMobileOpen}
            onMoreClick={() => setIsMobileOpen(true)}
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-structural bg-canvas/95 z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-xl sm:px-6 lg:px-8">
            {!isStandalone ? (
              <button
                type="button"
                className="rounded-control border-structural bg-surface text-ink-muted hover:text-ink-primary grid size-9 place-items-center border lg:hidden"
                aria-label="Open navigation"
                aria-controls="primary-navigation"
                aria-expanded={isMobileOpen}
                onClick={() => setIsMobileOpen(true)}
              >
                <Menu aria-hidden="true" size={18} />
              </button>
            ) : null}

            <div className="min-w-0 flex-1">
              <p className="text-ink-muted truncate text-[11px] font-medium tracking-[0.08em] uppercase">
                {eyebrow}
              </p>
              <h1 className="font-heading text-ink-primary truncate text-base font-semibold tracking-[-0.02em]">
                {pageTitle}
                {account?.displayName ? (
                  <span className="text-ink-muted ml-2 font-normal">
                    <span aria-hidden="true" className="text-ink-disabled mr-2">
                      |
                    </span>
                    {account.displayName}
                  </span>
                ) : null}
              </h1>
            </div>

            <ThemeToggle />

            <div className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={isNotificationsOpen}
                aria-label="Notifications"
                onClick={() => {
                  setIsNotificationsOpen((value) => !value);
                  setIsProfileMenuOpen(false);
                }}
                className="rounded-control border-structural bg-surface text-ink-muted hover:text-ink-primary grid size-9 place-items-center border"
              >
                <Bell aria-hidden="true" size={17} />
                <span className="sr-only">No unread notifications</span>
              </button>
              {isNotificationsOpen ? (
                <div className="border-structural bg-elevated rounded-control absolute top-full right-0 z-30 mt-1 w-64 border p-3 shadow-xl">
                  <p className="text-ink-primary text-sm font-medium">
                    Notifications
                  </p>
                  <p className="text-ink-muted mt-1 text-xs leading-5">
                    No notifications yet.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
                aria-label="Account menu"
                onClick={() => {
                  setIsProfileMenuOpen((value) => !value);
                  setIsNotificationsOpen(false);
                }}
                className="rounded-control border-structural bg-elevated text-action-soft font-heading grid size-9 shrink-0 place-items-center border text-xs font-bold"
              >
                {initial}
              </button>
              {isProfileMenuOpen ? (
                <div className="border-structural bg-elevated rounded-control absolute top-full right-0 z-30 mt-1 w-56 border py-1.5 shadow-xl">
                  <div className="border-divider border-b px-3 py-2">
                    <p className="text-ink-primary truncate text-sm font-medium">
                      {account?.displayName ?? roleLabels[role]}
                    </p>
                    <p className="text-ink-muted truncate text-[11px]">
                      {account?.email}
                    </p>
                    <p className="text-ink-muted mt-0.5 text-[11px]">
                      {roleLabels[role]}
                    </p>
                  </div>
                  <Link
                    href="/settings"
                    onClick={() => setIsProfileMenuOpen(false)}
                    className="text-ink-muted hover:bg-surface hover:text-ink-primary flex min-h-9 w-full items-center gap-2 px-3 text-xs"
                  >
                    <Settings aria-hidden="true" size={14} />
                    Settings
                  </Link>
                  <div className="border-divider my-1 border-t" />
                  <button
                    type="button"
                    disabled={isSigningOut}
                    onClick={() => void handleSignOut()}
                    className="text-ink-muted hover:bg-surface hover:text-ink-primary flex min-h-9 w-full items-center gap-2 px-3 text-xs disabled:cursor-wait disabled:opacity-60"
                  >
                    <LogOut aria-hidden="true" size={14} />
                    {isSigningOut ? "Logging out…" : "Log out"}
                  </button>
                </div>
              ) : null}
            </div>
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className={`flex-1 overflow-y-auto px-4 pt-6 sm:px-6 lg:px-8 lg:py-8 ${
              isStandalone
                ? "pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-8"
                : "pb-6 lg:pb-8"
            }`}
          >
            <div className="mx-auto max-w-[1600px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
