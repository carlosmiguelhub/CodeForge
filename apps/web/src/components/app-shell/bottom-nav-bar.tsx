"use client";

import type { Role } from "@sqweb/contracts";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";

import { roleNavigation } from "./navigation";

function shortLabel(label: string): string {
  return label.replace(" Workspace", "");
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
