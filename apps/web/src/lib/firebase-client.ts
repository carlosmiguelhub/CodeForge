import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";

export interface FirebaseClientServices {
  readonly auth: Auth;
}

let services: FirebaseClientServices | null | undefined;

export function getFirebaseClientServices(): FirebaseClientServices | null {
  if (services !== undefined) return services;
  if (typeof window === "undefined") return null;

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId) {
    services = null;
    return services;
  }

  const config = { apiKey, authDomain, projectId, appId };
  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const authEmulatorUrl = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL;
  if (authEmulatorUrl && !auth.emulatorConfig) {
    connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
  }
  services = { auth };
  return services;
}
