"use client";

import type { Role } from "@sqweb/contracts";
import { ArrowLeft, Menu, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useClassBottomNav } from "./class-bottom-nav-context";
import { roleNavigation } from "./navigation";

function shortLabel(label: string): string {
  return label.replace(" Workspace", "");
}

// Bottom bar shown while inside a specific class's tabs (Classwork/Quizzes/
// Code Racing/Scores/People). Shows up to 4 tabs directly, with any
// remainder plus "Back to My Classes"/"Main menu" tucked behind "More" —
// mirrors the global nav's own primary-4-plus-More shape so switching
// between the two feels like the same control, not a different pattern.
function ClassBottomNavBar({
  onOpenGlobalMenu,
}: Readonly<{ onOpenGlobalMenu: () => void }>) {
  const classNav = useClassBottomNav();
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    function onDocumentPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocumentPointerDown);
    return () =>
      document.removeEventListener("mousedown", onDocumentPointerDown);
  }, []);

  if (!classNav) return null;

  const visibleTabs = classNav.tabs.slice(0, 4);
  const overflowTabs = classNav.tabs.slice(4);
  const moreActive =
    moreOpen || overflowTabs.some((tab) => tab.id === classNav.activeTab);

  return (
    <nav
      aria-label="Class"
      className="border-structural bg-canvas/95 fixed inset-x-0 bottom-0 z-[25] border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="grid min-h-16 grid-cols-5">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === classNav.activeTab;
          return (
            <li key={tab.id} className="min-w-0">
              <button
                type="button"
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
                onClick={() => classNav.onTabChange(tab.id)}
                className={`${
                  active ? "text-action-soft" : "text-ink-muted"
                } relative flex min-h-16 w-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium`}
              >
                {active ? (
                  <span className="bg-action absolute inset-x-4 top-0 h-0.5 rounded-full" />
                ) : null}
                <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                <span className="max-w-full truncate">
                  {shortLabel(tab.label)}
                </span>
              </button>
            </li>
          );
        })}
        <li ref={menuRef} className="min-w-0">
          {moreOpen ? (
            // Positioned against the nav (the nearest `fixed`/positioned
            // ancestor), not this <li> — the <li> is only 1/5 of the bar's
            // width (the last grid column), so anchoring here directly
            // would squeeze the popover into that sliver instead of
            // spanning the full width.
            <div className="border-structural bg-elevated rounded-control absolute right-2 bottom-full left-2 z-[27] mb-2 border p-1.5 shadow-xl">
              {overflowTabs.map((tab) => {
                const Icon = tab.icon;
                const active = tab.id === classNav.activeTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      classNav.onTabChange(tab.id);
                      setMoreOpen(false);
                    }}
                    className={`${
                      active ? "text-action-soft bg-surface" : "text-ink-muted"
                    } rounded-control flex min-h-9 w-full items-center gap-2.5 px-3 text-xs font-medium`}
                  >
                    <Icon aria-hidden="true" size={15} strokeWidth={1.8} />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
              {overflowTabs.length > 0 ? (
                <div className="border-divider my-1 border-t" />
              ) : null}
              <Link
                href={classNav.backHref}
                onClick={() => setMoreOpen(false)}
                className="text-ink-muted hover:bg-surface hover:text-ink-primary rounded-control flex min-h-9 w-full items-center gap-2.5 px-3 text-xs font-medium"
              >
                <ArrowLeft aria-hidden="true" size={15} strokeWidth={1.8} />
                {classNav.backLabel}
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onOpenGlobalMenu();
                }}
                className="text-ink-muted hover:bg-surface hover:text-ink-primary rounded-control flex min-h-9 w-full items-center gap-2.5 px-3 text-xs font-medium"
              >
                <Menu aria-hidden="true" size={15} strokeWidth={1.8} />
                Main menu
              </button>
            </div>
          ) : null}
          <button
            type="button"
            aria-label="More"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((value) => !value)}
            className={`${
              moreActive ? "text-action-soft" : "text-ink-muted"
            } relative flex min-h-16 w-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium`}
          >
            {moreActive ? (
              <span className="bg-action absolute inset-x-4 top-0 h-0.5 rounded-full" />
            ) : null}
            <MoreHorizontal aria-hidden="true" size={18} strokeWidth={1.8} />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

export function BottomNavBar({
  role,
  activeHref,
  moreOpen,
  onMoreClick,
}: Readonly<{
  role: Role;
  activeHref: string;
  moreOpen: boolean;
  onMoreClick: () => void;
}>) {
  const classNav = useClassBottomNav();

  if (classNav) {
    return <ClassBottomNavBar onOpenGlobalMenu={onMoreClick} />;
  }

  const primaryItems = roleNavigation[role].slice(0, 4);
  const moreActive =
    moreOpen || !primaryItems.some((item) => item.href === activeHref);

  return (
    <nav
      aria-label="Primary"
      className="border-structural bg-canvas/95 fixed inset-x-0 bottom-0 z-[25] border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="grid min-h-16 grid-cols-5">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === activeHref;
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={`${
                  active ? "text-action-soft" : "text-ink-muted"
                } relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium`}
              >
                {active ? (
                  <span className="bg-action absolute inset-x-4 top-0 h-0.5 rounded-full" />
                ) : null}
                <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                <span className="max-w-full truncate">
                  {shortLabel(item.label)}
                </span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0">
          <button
            type="button"
            aria-label="More navigation"
            aria-controls="primary-navigation"
            aria-expanded={moreOpen}
            onClick={onMoreClick}
            className={`${
              moreActive ? "text-action-soft" : "text-ink-muted"
            } relative flex min-h-16 w-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium`}
          >
            {moreActive ? (
              <span className="bg-action absolute inset-x-4 top-0 h-0.5 rounded-full" />
            ) : null}
            <MoreHorizontal aria-hidden="true" size={18} strokeWidth={1.8} />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
