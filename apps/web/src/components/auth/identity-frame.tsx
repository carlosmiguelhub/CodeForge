import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme/theme-toggle";

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
    <main
      className="bg-canvas flex min-h-dvh items-center justify-center px-4 py-10"
      style={{
        background:
          "radial-gradient(60% 45% at 50% 0%, color-mix(in srgb, var(--color-action) 12%, transparent), transparent 70%), var(--color-canvas)",
      }}
    >
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between gap-2">
          <Link
            href="/login"
            className="text-ink-primary flex w-fit items-center gap-2"
          >
            <span className="grid size-8 place-items-center">
              <Image
                src="/codeforge-mark.png"
                alt=""
                width={32}
                height={32}
                className="size-8"
              />
            </span>
            <span className="font-heading font-semibold">CodeForge</span>
          </Link>
          <ThemeToggle />
        </div>

        <div
          className="border-structural bg-panel rounded-panel border p-6 sm:p-8"
          style={{ boxShadow: "var(--shadow-panel)" }}
        >
          <p className="text-action-soft text-xs font-semibold tracking-[0.12em] uppercase">
            {eyebrow}
          </p>
          <h1 className="font-heading text-ink-primary mt-3 text-3xl font-semibold tracking-[-0.04em]">
            {title}
          </h1>
          <p className="text-ink-muted mt-3 text-sm leading-6">{description}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </main>
  );
}
