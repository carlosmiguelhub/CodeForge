import { CloudOff } from "lucide-react";
import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="bg-canvas text-ink grid min-h-dvh place-items-center px-5 py-10">
      <section className="border-structural bg-surface rounded-panel w-full max-w-md border p-6 text-center shadow-xl">
        <span className="border-divider bg-elevated text-action-soft rounded-control mx-auto grid size-12 place-items-center border">
          <CloudOff aria-hidden="true" size={22} />
        </span>
        <h1 className="font-heading text-ink-primary mt-4 text-xl font-semibold">
          You&apos;re offline
        </h1>
        <p className="text-ink-muted mt-2 text-sm leading-6">
          Reconnect to keep working. SQL runs, code execution, ERD saving, and
          Java GUI sessions need a live connection.
        </p>
        <Link
          href="/"
          className="bg-action rounded-control mt-5 inline-flex min-h-10 items-center justify-center px-4 text-sm font-semibold text-white"
        >
          Try again
        </Link>
      </section>
    </main>
  );
}
