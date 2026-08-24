const PENDING_SECTION_KEY = "sqweb:pending-section-id";

// Relays the section chosen on /register through to /continue's deferred
// account-creation call — registration only creates the Firebase user (no
// platform account exists yet to attach a section to), and the actual
// POST /v1/registrations call can't happen until after email verification.
export function setPendingSectionId(sectionId: string) {
  try {
    window.sessionStorage.setItem(PENDING_SECTION_KEY, sectionId);
  } catch {
    // Storage can be unavailable (private browsing) — registration still
    // completes, the section will just need to be picked again if this
    // browser bounces through /continue without it.
  }
}

export function getPendingSectionId(): string | null {
  try {
    return window.sessionStorage.getItem(PENDING_SECTION_KEY);
  } catch {
    return null;
  }
}

export function clearPendingSectionId() {
  try {
    window.sessionStorage.removeItem(PENDING_SECTION_KEY);
  } catch {
    // Nothing to clean up if storage was never reachable.
  }
}
