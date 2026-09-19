import type { Role } from "@sqweb/contracts";
import {
  AppWindow,
  CircleGauge,
  Code2,
  Database,
  GraduationCap,
  Globe,
  Layers,
  Network,
  ScrollText,
  ServerCog,
  Settings,
  SquareTerminal,
  Trophy,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavigationItem {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  // Adds extra spacing above this item in the sidebar to set it apart from
  // the group before it, without needing a separate grouping data shape.
  readonly separated?: boolean;
}

export const roleNavigation = {
  student: [
    { label: "Dashboard", href: "/student", icon: CircleGauge },
    {
      label: "SQL Workspace",
      href: "/student/workspaces",
      icon: SquareTerminal,
    },
    {
      label: "Code Workspace",
      href: "/student/code-workspace",
      icon: Code2,
    },
    {
      label: "Web Workspace",
      href: "/student/web-workspace",
      icon: Globe,
    },
    {
      label: "ERD Workspace",
      href: "/student/erd-workspace",
      icon: Network,
    },
    { label: "Saved Queries", href: "/student/saved-queries", icon: Database },
    {
      label: "Java GUI Workspace",
      href: "/student/java-gui-workspace",
      icon: AppWindow,
    },
    {
      label: "My Classes",
      href: "/student/classes",
      icon: GraduationCap,
      separated: true,
    },
  ],
  // Deliberately narrower than the student nav: a teacher account's job is
  // teaching, not running the practice workspaces. The underlying
  // /teacher/workspaces, /teacher/code-workspace, etc. pages are untouched
  // and still reachable by direct URL — only removed here from discovery —
  // so this is easy to reverse if that scope call changes later. The old
  // pre-pivot placeholders (Database Templates/Students/Analytics, which
  // never had real pages behind them) are dropped outright instead.
  teacher: [
    { label: "Dashboard", href: "/teacher", icon: CircleGauge },
    { label: "My Classes", href: "/teacher/classes", icon: GraduationCap },
  ],
  administrator: [
    { label: "Dashboard", href: "/admin", icon: CircleGauge },
    {
      label: "Top Contributors",
      href: "/admin/top-contributors",
      icon: Trophy,
    },
    { label: "Users", href: "/admin/users", icon: Users },
    { label: "Sections", href: "/admin/sections", icon: Layers },
    {
      label: "Database Infrastructure",
      href: "/admin/infrastructure",
      icon: ServerCog,
    },
    { label: "Audit Logs", href: "/admin/audit-logs", icon: ScrollText },
    { label: "System Settings", href: "/admin/settings", icon: Settings },
  ],
} as const satisfies Record<Role, readonly NavigationItem[]>;

export const roleLabels: Record<Role, string> = {
  student: "Student",
  teacher: "Teacher",
  administrator: "Administrator",
};
