"use client";

import type { Role } from "@sqweb/contracts";
import {
  Bell,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { productIcon, roleLabels, roleNavigation } from "./navigation";
import { useAuth } from "@/components/auth/auth-provider";

interface AppShellProps {
  readonly role: Role;
  readonly activeHref: string;
  readonly pageTitle: string;
  readonly eyebrow: string;
  readonly children: ReactNode;
}

export function AppShell({
  role,
  activeHref,
  pageTitle,
  eyebrow,
  children,
}: AppShellProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { signOut } = useAuth();
  const router = useRouter();
  const ProductIcon = productIcon;

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
    <div className="bg-canvas text-ink min-h-dvh">
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

      <div className="flex min-h-dvh">
        <aside
          id="primary-navigation"
          className={`border-structural bg-sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r transition-[width,transform] duration-[180ms] lg:static lg:translate-x-0 ${
            isMobileOpen ? "translate-x-0" : "-translate-x-full"
          } ${isCollapsed ? "lg:w-16" : "lg:w-64"}`}
        >
          <div className="border-divider flex h-14 items-center gap-3 border-b px-3">
            <span className="rounded-control border-structural bg-surface text-action-soft grid size-8 shrink-0 place-items-center border">
              <ProductIcon aria-hidden="true" size={17} strokeWidth={1.7} />
            </span>
            <div className={`min-w-0 flex-1 ${isCollapsed ? "lg:hidden" : ""}`}>
              <p className="font-heading text-ink-primary truncate text-[15px] font-semibold tracking-[-0.02em]">
                SQWeb
              </p>
              <p className="text-ink-muted truncate text-[11px]">
                SQL classroom
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

          <div
            className={`border-divider border-b px-3 py-3 ${isCollapsed ? "lg:px-2" : ""}`}
          >
            <div className="rounded-control border-divider bg-surface flex items-center gap-2 border px-2 py-2">
              <span className="rounded-control bg-elevated font-heading text-action-soft grid size-6 shrink-0 place-items-center text-[10px] font-bold">
                {roleLabels[role].slice(0, 1)}
              </span>
              <div className={`min-w-0 ${isCollapsed ? "lg:hidden" : ""}`}>
                <p className="text-ink-primary truncate text-xs font-medium">
                  SQWeb classroom
                </p>
                <p className="text-ink-muted truncate text-[11px]">
                  {roleLabels[role]} workspace
                </p>
              </div>
            </div>
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
              disabled={isSigningOut}
              onClick={() => void handleSignOut()}
              className={`rounded-control text-ink-muted hover:bg-surface hover:text-ink-primary flex min-h-9 w-full items-center gap-3 px-2 text-xs disabled:cursor-wait disabled:opacity-60 ${
                isCollapsed ? "lg:justify-center" : ""
              }`}
              aria-label="Log out"
              title={isCollapsed ? "Log out" : undefined}
            >
              <LogOut aria-hidden="true" size={16} />
              <span className={isCollapsed ? "lg:hidden" : ""}>
                {isSigningOut ? "Logging out…" : "Log out"}
              </span>
            </button>
            <button
              type="button"
              className={`rounded-control text-ink-muted hover:bg-surface hover:text-ink hidden h-9 w-full items-center gap-3 px-2 text-xs lg:flex ${
                isCollapsed ? "justify-center" : ""
              }`}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!isCollapsed}
              onClick={() => setIsCollapsed((current) => !current)}
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

        <div className="min-w-0 flex-1">
          <header className="border-structural bg-canvas/95 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 backdrop-blur-xl sm:px-6 lg:px-8">
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

            <div className="min-w-0 flex-1">
              <p className="text-ink-muted truncate text-[11px] font-medium tracking-[0.08em] uppercase">
                {eyebrow}
              </p>
              <h1 className="font-heading text-ink-primary truncate text-base font-semibold tracking-[-0.02em]">
                {pageTitle}
              </h1>
            </div>

            <span className="text-ink-muted hidden items-center gap-2 text-xs sm:flex">
              <span
                className="bg-warning size-1.5 rounded-full"
                aria-hidden="true"
              />
              Classroom core
            </span>
            <button
              type="button"
              aria-label="Notifications"
              className="rounded-control border-structural bg-surface text-ink-muted hover:text-ink-primary relative grid size-9 place-items-center border"
            >
              <Bell aria-hidden="true" size={17} />
              <span className="sr-only">No unread notifications</span>
            </button>
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
          >
            <div className="mx-auto max-w-[1600px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
