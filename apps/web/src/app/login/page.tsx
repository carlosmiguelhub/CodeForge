"use client";

import { Lock, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useEffect, useState } from "react";

import { IdentityFrame } from "@/components/auth/identity-frame";
import { IdentityStatus } from "@/components/auth/identity-status";
import { useAuth } from "@/components/auth/auth-provider";
import { TextField } from "@/components/auth/text-field";
import { Spinner } from "@/components/ui/spinner";

function LoginForm() {
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";
  const [busy, setBusy] = useState(false);
  const alreadySignedIn =
    auth.state !== "initializing" &&
    auth.state !== "unavailable" &&
    auth.state !== "anonymous";

  useEffect(() => {
    if (alreadySignedIn) router.replace("/continue");
  }, [alreadySignedIn, router]);

  // A stale bookmark, browser-history entry, or autocomplete suggestion can
  // still carry credentials in the query string from before form submission
  // was hardened. Scrub it immediately via history.replaceState so it stops
  // being re-offered by the browser and never lingers in the address bar.
  useEffect(() => {
    if (!searchParams.has("password") && !searchParams.has("email")) return;
    const params = new URLSearchParams(searchParams);
    params.delete("email");
    params.delete("password");
    const query = params.toString();
    router.replace(query ? `/login?${query}` : "/login");
  }, [searchParams, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await auth.signInWithEmail(
        String(form.get("email")),
        String(form.get("password")),
      );
      router.push("/continue");
    } catch {
      // AuthProvider exposes a safe user-facing error message.
    } finally {
      setBusy(false);
    }
  }

  if (alreadySignedIn)
    return (
      <IdentityFrame
        eyebrow="Authorized access"
        title="Continuing your session"
        description="You're already signed in. Redirecting…"
      >
        <div className="bg-divider h-1 overflow-hidden rounded-full">
          <div className="bg-action h-full w-1/2 motion-safe:animate-pulse" />
        </div>
      </IdentityFrame>
    );

  return (
    <IdentityFrame
      eyebrow="Authorized access"
      title="Sign in"
      description="Use your verified CodeForge identity. Role and account state are checked again by the platform API."
    >
      <div className="space-y-4">
        {justRegistered ? (
          <IdentityStatus tone="success">
            Account created. Check your email for a verification link, then sign
            in below.
          </IdentityStatus>
        ) : null}
        {auth.state === "unavailable" ? (
          <IdentityStatus tone="error">
            Firebase and the platform API are not configured. Copy
            `.env.example` and provide approved local values.
          </IdentityStatus>
        ) : null}
        {auth.error ? (
          <IdentityStatus tone="error">{auth.error}</IdentityStatus>
        ) : null}
        <form
          method="post"
          className="space-y-4"
          onSubmit={(event) => void submit(event)}
        >
          <TextField
            label="Email address"
            icon={Mail}
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <TextField
            label="Password"
            icon={Lock}
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <div className="flex justify-end">
            <a
              href="/forgot-password"
              className="text-action-soft text-xs underline-offset-4 hover:underline"
            >
              Forgot password?
            </a>
          </div>
          <button
            type="submit"
            disabled={busy || auth.state === "unavailable"}
            className="rounded-control bg-action hover:bg-action/90 flex h-10 w-full items-center justify-center gap-2 px-4 font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Spinner size={16} /> : null}
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-ink-muted text-center text-xs">
          Haven&rsquo;t verified your email yet? Sign in above and
          you&rsquo;ll be prompted to resend the link.
        </p>
        <p className="text-ink-muted text-center text-xs">
          Need an account?{" "}
          <a
            href="/register"
            className="text-action-soft underline-offset-4 hover:underline"
          >
            Register
          </a>
        </p>
      </div>
    </IdentityFrame>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
