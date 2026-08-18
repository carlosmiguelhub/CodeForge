import Link from "next/link";

export default function NotFound() {
  return (
    <main className="bg-canvas text-ink grid min-h-dvh place-items-center px-4 text-center">
      <div className="max-w-md">
        <p className="text-action-soft text-xs font-semibold tracking-[0.12em] uppercase">
          404
        </p>
        <h1 className="font-heading text-ink-primary mt-3 text-3xl font-semibold tracking-[-0.04em]">
          Route not available
        </h1>
        <p className="text-ink-muted mt-3 text-sm leading-6">
          Only the approved foundation preview exists in this milestone.
        </p>
        <Link
          href="/"
          className="rounded-control bg-action hover:bg-action/90 mt-6 inline-flex h-9 items-center px-4 text-sm font-semibold text-white"
        >
          Return to foundation
        </Link>
      </div>
    </main>
  );
}
