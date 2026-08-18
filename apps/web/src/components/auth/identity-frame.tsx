import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function IdentityFrame({
  eyebrow,
  title,
  description,
  children,
}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}>) {
  return (
    <main className="bg-canvas grid min-h-dvh lg:grid-cols-[minmax(0,0.8fr)_minmax(460px,0.55fr)]">
      <section className="border-structural bg-deep hidden border-r p-10 lg:flex lg:flex-col lg:justify-between">
        <Link
          href="/preview"
          className="text-ink-primary flex w-fit items-center gap-3"
        >
          <span className="rounded-control border-structural bg-surface text-action-soft grid size-9 place-items-center border">
            <ShieldCheck aria-hidden="true" size={18} />
          </span>
          <span className="font-heading text-base font-semibold">SQWeb</span>
        </Link>
        <div className="max-w-xl pb-10">
          <p className="text-action-soft text-xs font-semibold tracking-[0.12em] uppercase">
            Secure SQL classroom
          </p>
          <p className="font-heading text-ink-primary mt-5 text-4xl leading-[1.05] font-semibold tracking-[-0.045em] xl:text-5xl">
            One verified identity. Explicit authority at every boundary.
          </p>
          <p className="text-ink-muted mt-5 max-w-lg text-sm leading-6">
            Authentication establishes who you are. SQWeb&apos;s server still
            verifies account state, role, institution, and resource permission
            for every protected request.
          </p>
        </div>
        <p className="text-ink-muted text-xs">
          Milestone 2 · Identity and authorization
        </p>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link
            href="/preview"
            className="text-ink-primary mb-10 flex w-fit items-center gap-2 lg:hidden"
          >
            <ShieldCheck
              aria-hidden="true"
              size={18}
              className="text-action-soft"
            />
            <span className="font-heading font-semibold">SQWeb</span>
          </Link>
          <p className="text-action-soft text-xs font-semibold tracking-[0.12em] uppercase">
            {eyebrow}
          </p>
          <h1 className="font-heading text-ink-primary mt-3 text-3xl font-semibold tracking-[-0.04em]">
            {title}
          </h1>
          <p className="text-ink-muted mt-3 text-sm leading-6">{description}</p>
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </main>
  );
}
