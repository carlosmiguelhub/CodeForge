"use client";

import type { LucideIcon } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface ClassBottomNavTab {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

export interface ClassBottomNavConfig {
  readonly backHref: string;
  readonly backLabel: string;
  readonly tabs: readonly ClassBottomNavTab[];
  readonly activeTab: string;
  readonly onTabChange: (id: string) => void;
}

interface ClassBottomNavContextValue {
  readonly config: ClassBottomNavConfig | null;
  readonly setConfig: (config: ClassBottomNavConfig | null) => void;
}

const ClassBottomNavContext = createContext<ClassBottomNavContextValue | null>(
  null,
);

// Wraps the whole shell (sidebar + bottom nav + page content) so a page deep
// in `children` (e.g. ClassDetail) and the bottom nav rendered as its
// sibling can share one slot, without threading class-specific props through
// AppShell itself.
export function ClassBottomNavProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [config, setConfig] = useState<ClassBottomNavConfig | null>(null);
  const value = useMemo(() => ({ config, setConfig }), [config]);
  return (
    <ClassBottomNavContext.Provider value={value}>
      {children}
    </ClassBottomNavContext.Provider>
  );
}

export function useClassBottomNav(): ClassBottomNavConfig | null {
  const ctx = useContext(ClassBottomNavContext);
  return ctx?.config ?? null;
}

// Publishes `config` into the shared bottom-nav slot for as long as the
// calling page stays mounted, and clears it on unmount so navigating away
// restores the app's normal bottom nav. Pass `null` when the page has
// nothing to publish (e.g. still loading). Callers should memoize `config`
// (useMemo) so this doesn't re-publish on every unrelated re-render.
export function usePublishClassBottomNav(config: ClassBottomNavConfig | null) {
  const ctx = useContext(ClassBottomNavContext);
  const setConfig = ctx?.setConfig;
  useEffect(() => {
    setConfig?.(config);
    return () => setConfig?.(null);
  }, [config, setConfig]);
}
