import type { Role } from "@sqweb/contracts";
import {
  Activity,
  Bell,
  BookOpen,
  ChartNoAxesCombined,
  CircleGauge,
  ClipboardCheck,
  Database,
  FileClock,
  GraduationCap,
  ListChecks,
  ScrollText,
  ServerCog,
  Settings,
  ShieldCheck,
  SquareTerminal,
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
    { label: "Classes", href: "/student/classes", icon: BookOpen },
    { label: "Activities", href: "/student/activities", icon: Activity },
    { label: "Submissions", href: "/student/submissions", icon: FileClock },
    { label: "Grades", href: "/student/grades", icon: GraduationCap },
    { label: "Saved Queries", href: "/student/saved-queries", icon: Database },
    { label: "Notifications", href: "/notifications", icon: Bell },
  ],
  teacher: [
    { label: "Dashboard", href: "/teacher", icon: CircleGauge },
    {
      label: "SQL Workspace",
      href: "/teacher/workspaces",
      icon: SquareTerminal,
    },
    { label: "Classes", href: "/teacher/classes", icon: BookOpen },
    { label: "Activities", href: "/teacher/activities", icon: Activity },
    { label: "Grading", href: "/teacher/grading", icon: ClipboardCheck },
    { label: "Database Templates", href: "/teacher/templates", icon: Database },
    { label: "Students", href: "/teacher/students", icon: Users },
    {
      label: "Analytics",
      href: "/teacher/analytics",
      icon: ChartNoAxesCombined,
    },
    { label: "Notifications", href: "/notifications", icon: Bell },
  ],
  administrator: [
    { label: "Dashboard", href: "/admin", icon: CircleGauge },
    { label: "Users", href: "/admin/users", icon: Users },
    { label: "Academics", href: "/admin/academics", icon: GraduationCap },
    { label: "Classes", href: "/admin/classes", icon: BookOpen },
    {
      label: "Database Infrastructure",
      href: "/admin/infrastructure",
      icon: ServerCog,
    },
    {
      label: "Query Monitoring",
      href: "/admin/query-monitor",
      icon: ListChecks,
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

export const productIcon = ShieldCheck;
