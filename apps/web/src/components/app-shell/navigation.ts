import type { Role } from "@sqweb/contracts";
import {
  AppWindow,
  ChartNoAxesCombined,
  CircleGauge,
  Code2,
  Database,
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
  ],
  teacher: [
    { label: "Dashboard", href: "/teacher", icon: CircleGauge },
    {
      label: "SQL Workspace",
      href: "/teacher/workspaces",
      icon: SquareTerminal,
    },
    {
      label: "Code Workspace",
      href: "/teacher/code-workspace",
      icon: Code2,
    },
    {
      label: "ERD Workspace",
      href: "/teacher/erd-workspace",
      icon: Network,
    },
    { label: "Saved Queries", href: "/teacher/saved-queries", icon: Database },
    {
      label: "Java GUI Workspace",
      href: "/teacher/java-gui-workspace",
      icon: AppWindow,
    },
    { label: "Database Templates", href: "/teacher/templates", icon: Database },
    { label: "Students", href: "/teacher/students", icon: Users },
    {
      label: "Analytics",
      href: "/teacher/analytics",
      icon: ChartNoAxesCombined,
    },
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
