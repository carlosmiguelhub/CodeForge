import { AppShell } from "@/components/app-shell/app-shell";
import { FoundationDashboard } from "@/components/foundation-dashboard";

export default function PreviewPage() {
  return (
    <AppShell
      role="teacher"
      activeHref="/teacher"
      eyebrow="Teacher workspace"
      pageTitle="Dashboard"
    >
      <FoundationDashboard />
    </AppShell>
  );
}
