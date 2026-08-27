"use client";

import {
  accountProfileSchema,
  systemStatusSchema,
  type AccountProfile,
  type RequestedRegistrationRole,
  type SystemStatus,
} from "@sqweb/contracts";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onIdTokenChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { getFirebaseClientServices } from "@/lib/firebase-client";
import {
  clearActive,
  IDLE_TIMEOUT_MS,
  isIdleExpired,
  markActive,
} from "@/lib/idle-session";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

type IdentityState =
  | "initializing"
  | "unavailable"
  | "anonymous"
  | "unverified"
  | "unregistered"
  | "sync_error"
  | "ready";

interface AuthContextValue {
  readonly state: IdentityState;
  readonly user: User | null;
  readonly account: AccountProfile | null;
  readonly error: string | null;
  signInWithEmail(email: string, password: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  createEmailAccount(
    email: string,
    password: string,
    displayName: string,
  ): Promise<void>;
  resendVerification(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  updateDisplayName(displayName: string): Promise<void>;
  // Resolves to whether the reloaded user is now email-verified, so a
  // caller can tell "verification succeeded" apart from "still pending"
  // without racing this render's stale `state`/`user` closure values.
  reloadIdentity(): Promise<boolean>;
  completeRegistration(
    displayName: string,
    requestedRole: RequestedRegistrationRole,
    sectionId?: string,
  ): Promise<void>;
  authorizedFetch(path: string, init?: RequestInit): Promise<Response>;
  executionFetch(path: string, init?: RequestInit): Promise<Response>;
  // No bearer token — for reference data (like the section list) that a
  // page must read before any Firebase Auth session exists.
  publicFetch(path: string): Promise<Response>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const KNOWN_REGISTRATION_ERRORS = new Set([
  "Your session has expired. Sign in again.",
  "Registration could not be completed. Try again.",
]);
const apiBaseUrl = process.env.NEXT_PUBLIC_PLATFORM_API_URL ?? "";
const executionApiBaseUrl = process.env.NEXT_PUBLIC_EXECUTION_API_URL ?? "";
const subscribeToClient = () => () => undefined;
const IDLE_TIMEOUT_MESSAGE = `You were signed out after ${
  IDLE_TIMEOUT_MS / 60_000
} minutes of inactivity. Sign in again.`;
const SUSPENDED_LOGOUT_MESSAGE =
  "This account has been suspended or deactivated. Contact an administrator if you believe this is incorrect.";
// Mirrors packages/auth/src/identity-service.ts's DEFAULT_MAINTENANCE_MESSAGE
// — kept in sync manually since this is only the client-side fallback for
// when a maintenance-triggered force-logout somehow lands without a status
// fetch succeeding (e.g. the /v1/system/status check itself failed).
const DEFAULT_MAINTENANCE_MESSAGE =
  "CodeForge is temporarily undergoing scheduled maintenance. Please try again shortly.";
const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
] as const;

class AccountFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function safeIdentityMessage(error: unknown): string {
  if (error instanceof Error) {
    if (
      error.message.includes("auth/invalid-credential") ||
      error.message.includes("auth/user-not-found") ||
      error.message.includes("auth/wrong-password")
    )
      // user-not-found / wrong-password are the emulator's older, more
      // specific codes; production Firebase collapses both into
      // invalid-credential. Map them to the same vague message either way
      // so sign-in never reveals whether an email is registered.
      return "The email or password is incorrect.";
    if (error.message.includes("auth/email-already-in-use"))
      return "An account already uses this email address.";
    if (error.message.includes("auth/weak-password"))
      return "Use a stronger password with at least eight characters.";
    if (error.message.includes("auth/popup-closed-by-user"))
      return "Google sign-in was cancelled.";
    if (error.message.includes("auth/too-many-requests"))
      return "Too many attempts. Wait a few minutes before trying again.";
    if (error.message.includes("auth/network-request-failed"))
      return "Could not reach the identity service. Check your connection.";
  }
  // The UI intentionally never renders raw Firebase error detail, but an
  // unrecognized code still needs to be diagnosable locally.
  if (process.env.NODE_ENV !== "production")
    console.error("[CodeForge identity] unrecognized auth error:", error);
  return "The identity request could not be completed. Try again.";
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [state, setState] = useState<IdentityState>("initializing");
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isClient = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false,
  );
  const services = isClient ? getFirebaseClientServices() : undefined;

  // Carries the HTTP status alongside the message so callers can tell "the
  // server rejected this token outright" (401 — e.g. an admin just revoked
  // this account's sessions by suspending/deactivating it) apart from a
  // generic connectivity failure, which need very different handling.
  const fetchAccount = useCallback(
    async (currentUser: User): Promise<AccountProfile | null> => {
      if (!apiBaseUrl)
        throw new Error("The platform API URL is not configured.");
      const response = await fetch(`${apiBaseUrl}/v1/me`, {
        headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` },
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new AccountFetchError(
          "The platform account could not be loaded.",
          response.status,
        );
      }
      return accountProfileSchema.parse(await response.json());
    },
    [],
  );

  // Public — no bearer token — so it can be checked even when the account's
  // own token was already revoked (the bulk sign-out a maintenance toggle
  // triggers) or before any sign-in has happened at all.
  const checkSystemStatus =
    useCallback(async (): Promise<SystemStatus | null> => {
      if (!apiBaseUrl || !services) return null;
      try {
        const response = await fetch(`${apiBaseUrl}/v1/system/status`);
        if (!response.ok) return null;
        return systemStatusSchema.parse(await response.json());
      } catch {
        return null;
      }
    }, [services]);

  const idleLogoutMessageRef = useRef<string | null>(null);

  const forceIdleLogout = useCallback(() => {
    if (!services) return;
    clearActive();
    idleLogoutMessageRef.current = IDLE_TIMEOUT_MESSAGE;
    void firebaseSignOut(services.auth);
  }, [services]);

  // Reuses the same "set a message, then sign out" plumbing as the idle
  // timeout above — the null-user branch of `synchronize` (triggered by
  // `onIdTokenChanged` once Firebase confirms the sign-out) surfaces
  // `idleLogoutMessageRef.current` as `error`, so the login page shows why.
  const forceSuspendedLogout = useCallback(() => {
    if (!services) return;
    clearActive();
    idleLogoutMessageRef.current = SUSPENDED_LOGOUT_MESSAGE;
    void firebaseSignOut(services.auth);
  }, [services]);

  const forceMaintenanceLogout = useCallback(
    (message: string | null) => {
      if (!services) return;
      clearActive();
      idleLogoutMessageRef.current = message ?? DEFAULT_MAINTENANCE_MESSAGE;
      void firebaseSignOut(services.auth);
    },
    [services],
  );

  const synchronize = useCallback(
    async (currentUser: User | null) => {
      setUser(currentUser);
      if (!currentUser) {
        setAccount(null);
        setState("anonymous");
        // A forced idle/suspended sign-out routes through this same
        // null-user branch; surface its message once, then fall back to
        // clearing stale errors.
        setError(idleLogoutMessageRef.current);
        idleLogoutMessageRef.current = null;
        return;
      }
      setError(null);
      if (!currentUser.emailVerified) {
        setAccount(null);
        setState("unverified");
        return;
      }
      // Mark the state as unresolved for the duration of the account
      // lookup below, so components reading `state` during this async gap
      // see "please wait" instead of a stale value from before this user
      // signed in (which could otherwise trigger a premature redirect).
      setState("initializing");
      try {
        const profile = await fetchAccount(currentUser);
        setAccount(profile);
        setState(profile ? "ready" : "unregistered");
      } catch (error) {
        if (error instanceof AccountFetchError && error.status === 401) {
          // Landing here on a fresh load/reload with an already-revoked
          // token (e.g. the account was suspended before this tab was ever
          // opened) — sign out with the real reason instead of a confusing
          // "server unreachable" message.
          forceSuspendedLogout();
          return;
        }
        setAccount(null);
        setError(
          "Could not reach the CodeForge server. Check your connection and try again.",
        );
        setState("sync_error");
      }
    },
    [fetchAccount, forceSuspendedLogout],
  );

  const checkAccountStatus = useCallback(async () => {
    if (!services?.auth.currentUser) return;
    try {
      const profile = await fetchAccount(services.auth.currentUser);
      if (
        !profile ||
        profile.status === "suspended" ||
        profile.status === "deactivated"
      ) {
        forceSuspendedLogout();
        return;
      }
      // Maintenance mode revokes non-admin sessions in bulk, but this
      // tick's own token may not have been swept yet (or this tab signed
      // in after the sweep) — check directly rather than waiting for the
      // resulting 401, so the message is accurate every time.
      if (!profile.roles.includes("administrator")) {
        const status = await checkSystemStatus();
        if (status?.maintenanceMode) forceMaintenanceLogout(status.message);
      }
    } catch (error) {
      if (error instanceof AccountFetchError && error.status === 401) {
        // Could be a real suspend/deactivate, or this account's session
        // being swept by a maintenance toggle — ask which it was so the
        // shown message is accurate instead of always saying "suspended".
        const status = await checkSystemStatus();
        if (status?.maintenanceMode) {
          forceMaintenanceLogout(status.message);
        } else {
          forceSuspendedLogout();
        }
        return;
      }
      // Any other failure (network hiccup, 500, ...) is transient — the
      // next tick retries.
    }
  }, [
    services,
    fetchAccount,
    forceSuspendedLogout,
    forceMaintenanceLogout,
    checkSystemStatus,
  ]);

  // Live-detects an admin suspending/deactivating this account while it's
  // already signed in, instead of waiting for the user's next API call or
  // Firebase's own ~hourly token refresh. `pauseWhenHidden: false` because
  // this is a security control, not a UI freshness nicety — a suspended
  // account sitting in a background tab must still get signed out.
  usePolling(
    () => void checkAccountStatus(),
    DEFAULT_POLL_INTERVAL_MS,
    state === "ready",
    false,
  );

  useEffect(() => {
    if (services === undefined) return;
    if (!services || !apiBaseUrl) return;
    // The first callback after subscribing fires with whatever session
    // Firebase silently restored from persisted storage (if any) — that's
    // the one case we need to gate on elapsed idle time. Later callbacks
    // come from explicit sign-in/out or token refresh and shouldn't be.
    let isRestoredSession = true;
    return onIdTokenChanged(services.auth, (currentUser) => {
      const checkRestoredSession = isRestoredSession;
      isRestoredSession = false;
      if (checkRestoredSession && currentUser && isIdleExpired()) {
        forceIdleLogout();
        return;
      }
      if (currentUser) markActive();
      void synchronize(currentUser);
    });
  }, [services, synchronize, forceIdleLogout]);

  useEffect(() => {
    if (!services) return;
    const handleActivity = () => markActive();
    for (const event of ACTIVITY_EVENTS)
      window.addEventListener(event, handleActivity, { passive: true });
    const interval = window.setInterval(() => {
      if (services.auth.currentUser && isIdleExpired()) forceIdleLogout();
    }, 30_000);
    return () => {
      for (const event of ACTIVITY_EVENTS)
        window.removeEventListener(event, handleActivity);
      window.clearInterval(interval);
    };
  }, [services, forceIdleLogout]);

  const effectiveState: IdentityState =
    isClient && (!services || !apiBaseUrl) ? "unavailable" : state;

  const authorizedFetch = useCallback(
    async (path: string, init: RequestInit = {}) => {
      if (!services?.auth.currentUser)
        throw new Error("Authentication is required.");
      const headers = new Headers(init.headers);
      headers.set(
        "Authorization",
        `Bearer ${await services.auth.currentUser.getIdToken()}`,
      );
      if (init.body) headers.set("Content-Type", "application/json");
      return fetch(`${apiBaseUrl}${path}`, { ...init, headers });
    },
    [services],
  );

  const executionFetch = useCallback(
    async (path: string, init: RequestInit = {}) => {
      if (!services?.auth.currentUser)
        throw new Error("Authentication is required.");
      if (!executionApiBaseUrl)
        throw new Error("The SQL Execution API is not configured.");
      const headers = new Headers(init.headers);
      headers.set(
        "Authorization",
        `Bearer ${await services.auth.currentUser.getIdToken()}`,
      );
      if (init.body) headers.set("Content-Type", "application/json");
      return fetch(`${executionApiBaseUrl}${path}`, { ...init, headers });
    },
    [services],
  );

  const publicFetch = useCallback(
    async (path: string) => {
      if (!services) throw new Error("Firebase is not configured.");
      return fetch(`${apiBaseUrl}${path}`);
    },
    [services],
  );

  const value: AuthContextValue = {
    state: effectiveState,
    user,
    account,
    error,
    async signInWithEmail(email, password) {
      if (!services) throw new Error("Firebase is not configured.");
      setError(null);
      try {
        await signInWithEmailAndPassword(services.auth, email, password);
      } catch (signInError) {
        const message = safeIdentityMessage(signInError);
        setError(message);
        throw new Error(message);
      }
    },
    async signInWithGoogle() {
      if (!services) throw new Error("Firebase is not configured.");
      setError(null);
      try {
        await signInWithPopup(services.auth, new GoogleAuthProvider());
      } catch (signInError) {
        const message = safeIdentityMessage(signInError);
        setError(message);
        throw new Error(message);
      }
    },
    async createEmailAccount(email, password, displayName) {
      if (!services) throw new Error("Firebase is not configured.");
      setError(null);
      try {
        const credential = await createUserWithEmailAndPassword(
          services.auth,
          email,
          password,
        );
        await updateProfile(credential.user, { displayName });
        await sendEmailVerification(credential.user);
        await synchronize(credential.user);
      } catch (registrationError) {
        const message = safeIdentityMessage(registrationError);
        setError(message);
        throw new Error(message);
      }
    },
    async resendVerification() {
      if (!services?.auth.currentUser)
        throw new Error("Authentication is required.");
      await sendEmailVerification(services.auth.currentUser);
    },
    async sendPasswordReset(email) {
      if (!services) throw new Error("Firebase is not configured.");
      setError(null);
      try {
        await sendPasswordResetEmail(services.auth, email);
      } catch (resetError) {
        if (
          resetError instanceof Error &&
          resetError.message.includes("auth/user-not-found")
        ) {
          // Don't reveal whether an email address is registered.
          return;
        }
        const message = safeIdentityMessage(resetError);
        setError(message);
        throw new Error(message);
      }
    },
    async updateDisplayName(displayName) {
      setError(null);
      try {
        const response = await authorizedFetch("/v1/me", {
          method: "PATCH",
          body: JSON.stringify({ displayName }),
        });
        if (!response.ok) throw new Error();
        const profile = accountProfileSchema.parse(await response.json());
        setAccount(profile);
        if (services?.auth.currentUser) {
          await updateProfile(services.auth.currentUser, {
            displayName,
          }).catch(() => undefined);
        }
      } catch {
        const message = "Your display name could not be updated. Try again.";
        setError(message);
        throw new Error(message);
      }
    },
    async reloadIdentity() {
      if (!services?.auth.currentUser) return false;
      await reload(services.auth.currentUser);
      const verified = services.auth.currentUser.emailVerified;
      // reload() updates the local User object, but the cached ID token's
      // own email_verified claim (what the backend actually checks) is
      // still whatever it was when the token was issued. Without forcing
      // a refresh here, the very next authorized request — completeRegistration,
      // fired automatically by /continue right after this resolves — would
      // carry a stale token and get rejected as still-unverified.
      if (verified) await services.auth.currentUser.getIdToken(true);
      await synchronize(services.auth.currentUser);
      return verified;
    },
    async completeRegistration(displayName, requestedRole, sectionId) {
      setError(null);
      try {
        const response = await authorizedFetch("/v1/registrations", {
          method: "POST",
          body: JSON.stringify({
            displayName,
            requestedRole,
            ...(sectionId ? { sectionId } : {}),
          }),
        });
        if (!response.ok) {
          if (response.status === 401)
            throw new Error("Your session has expired. Sign in again.");
          throw new Error("Registration could not be completed. Try again.");
        }
        const profile = accountProfileSchema.parse(await response.json());
        setAccount(profile);
        setState("ready");
        if (services?.auth.currentUser)
          await services.auth.currentUser.getIdToken(true);
      } catch (registrationError) {
        const message =
          registrationError instanceof Error &&
          KNOWN_REGISTRATION_ERRORS.has(registrationError.message)
            ? registrationError.message
            : "Could not reach the CodeForge server. Check your connection and try again.";
        setError(message);
        throw new Error(message);
      }
    },
    async signOut() {
      clearActive();
      if (services) await firebaseSignOut(services.auth);
    },
    authorizedFetch,
    executionFetch,
    publicFetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
