"use client";

import {
  accountProfileSchema,
  type AccountProfile,
  type RequestedRegistrationRole,
} from "@sqweb/contracts";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onIdTokenChanged,
  reload,
  sendEmailVerification,
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
  useState,
  useSyncExternalStore,
} from "react";

import {
  getAppCheckHeader,
  getFirebaseClientServices,
} from "@/lib/firebase-client";

type IdentityState =
  | "initializing"
  | "unavailable"
  | "anonymous"
  | "unverified"
  | "unregistered"
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
  reloadIdentity(): Promise<void>;
  completeRegistration(
    displayName: string,
    requestedRole: RequestedRegistrationRole,
  ): Promise<void>;
  authorizedFetch(
    path: string,
    init?: RequestInit,
    requireAppCheck?: boolean,
  ): Promise<Response>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const apiBaseUrl = process.env.NEXT_PUBLIC_PLATFORM_API_URL ?? "";
const localAppCheckToken = process.env.NEXT_PUBLIC_LOCAL_APP_CHECK_TOKEN;
const subscribeToClient = () => () => undefined;

function safeIdentityMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("auth/invalid-credential"))
      return "The email or password is incorrect.";
    if (error.message.includes("auth/email-already-in-use"))
      return "An account already uses this email address.";
    if (error.message.includes("auth/weak-password"))
      return "Use a stronger password with at least eight characters.";
    if (error.message.includes("auth/popup-closed-by-user"))
      return "Google sign-in was cancelled.";
  }
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

  const fetchAccount = useCallback(
    async (currentUser: User): Promise<AccountProfile | null> => {
      if (!apiBaseUrl)
        throw new Error("The platform API URL is not configured.");
      const response = await fetch(`${apiBaseUrl}/v1/me`, {
        headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` },
      });
      if (response.status === 404) return null;
      if (!response.ok)
        throw new Error("The platform account could not be loaded.");
      return accountProfileSchema.parse(await response.json());
    },
    [],
  );

  const synchronize = useCallback(
    async (currentUser: User | null) => {
      setUser(currentUser);
      setError(null);
      if (!currentUser) {
        setAccount(null);
        setState("anonymous");
        return;
      }
      if (!currentUser.emailVerified) {
        setAccount(null);
        setState("unverified");
        return;
      }
      try {
        const profile = await fetchAccount(currentUser);
        setAccount(profile);
        setState(profile ? "ready" : "unregistered");
      } catch (syncError) {
        setError(safeIdentityMessage(syncError));
        setState("unregistered");
      }
    },
    [fetchAccount],
  );

  useEffect(() => {
    if (services === undefined) return;
    if (!services || !apiBaseUrl) return;
    return onIdTokenChanged(services.auth, (currentUser) => {
      void synchronize(currentUser);
    });
  }, [services, synchronize]);

  const effectiveState: IdentityState =
    isClient && (!services || !apiBaseUrl) ? "unavailable" : state;

  const authorizedFetch = useCallback(
    async (path: string, init: RequestInit = {}, requireAppCheck = false) => {
      if (!services?.auth.currentUser)
        throw new Error("Authentication is required.");
      const headers = new Headers(init.headers);
      headers.set(
        "Authorization",
        `Bearer ${await services.auth.currentUser.getIdToken()}`,
      );
      headers.set("Content-Type", "application/json");
      if (requireAppCheck) {
        if (services.appCheck) {
          headers.set(
            "X-Firebase-AppCheck",
            await getAppCheckHeader(services.appCheck),
          );
        } else if (
          localAppCheckToken &&
          process.env.NODE_ENV !== "production"
        ) {
          headers.set("X-Firebase-AppCheck", localAppCheckToken);
        } else {
          throw new Error(
            "Firebase App Check is required but has not been configured.",
          );
        }
      }
      return fetch(`${apiBaseUrl}${path}`, { ...init, headers });
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
    async reloadIdentity() {
      if (!services?.auth.currentUser) return;
      await reload(services.auth.currentUser);
      await synchronize(services.auth.currentUser);
    },
    async completeRegistration(displayName, requestedRole) {
      const response = await authorizedFetch(
        "/v1/registrations",
        {
          method: "POST",
          body: JSON.stringify({ displayName, requestedRole }),
        },
        true,
      );
      if (!response.ok) throw new Error("Registration could not be completed.");
      const profile = accountProfileSchema.parse(await response.json());
      setAccount(profile);
      setState("ready");
      if (services?.auth.currentUser)
        await services.auth.currentUser.getIdToken(true);
    },
    async signOut() {
      if (services) await firebaseSignOut(services.auth);
    },
    authorizedFetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
