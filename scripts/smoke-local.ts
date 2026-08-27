const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!emulatorHost) {
  throw new Error("Local Firebase settings are required.");
}

const apiBaseUrl = "http://127.0.0.1:8080";
const password = "Local-SQWeb-2026!";
const courseId = "00000000-0000-4000-8000-000000000022";
const termId = "00000000-0000-4000-8000-000000000023";

async function signIn(email: string): Promise<string> {
  const response = await fetch(
    `http://${emulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const payload = (await response.json()) as {
    idToken?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.idToken) {
    throw new Error(
      `Local sign-in failed for ${email}: ${payload.error?.message ?? "unknown error"}`,
    );
  }
  return payload.idToken;
}

async function api(token: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${apiBaseUrl}${path}`, { ...init, headers });
}

async function main() {
  const teacherToken = await signIn("teacher@sqweb.local");
  const studentToken = await signIn("student@sqweb.local");

  const teacherClassesResponse = await api(teacherToken, "/v1/classes");
  if (!teacherClassesResponse.ok) throw new Error("Teacher class list failed.");
  const teacherClasses = (await teacherClassesResponse.json()) as Array<{
    id: string;
    section: string;
  }>;
  let classId = teacherClasses.find(
    (item) => item.section === "LOCAL-SMOKE",
  )?.id;

  if (!classId) {
    const createResponse = await api(teacherToken, "/v1/classes", {
      method: "POST",
      body: JSON.stringify({ courseId, termId, section: "LOCAL-SMOKE" }),
    });
    if (createResponse.status !== 201) {
      throw new Error(
        `Teacher class creation failed (${createResponse.status}).`,
      );
    }
    classId = ((await createResponse.json()) as { id: string }).id;
  }

  const studentClassesResponse = await api(studentToken, "/v1/classes");
  if (!studentClassesResponse.ok) throw new Error("Student class list failed.");
  const studentClasses = (await studentClassesResponse.json()) as Array<{
    id: string;
  }>;

  if (!studentClasses.some((item) => item.id === classId)) {
    const invitationResponse = await api(
      teacherToken,
      `/v1/classes/${classId}/invites`,
      {
        method: "POST",
        body: JSON.stringify({
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          usageLimit: 1,
        }),
      },
    );
    if (invitationResponse.status !== 201)
      throw new Error("Invitation creation failed.");
    const invitation = (await invitationResponse.json()) as { code: string };
    const joinResponse = await api(studentToken, `/v1/classes/${classId}/join`, {
      method: "POST",
      body: JSON.stringify({ code: invitation.code }),
    });
    if (!joinResponse.ok) throw new Error("Student enrollment failed.");
  }

  const rosterResponse = await api(
    teacherToken,
    `/v1/classes/${classId}/roster`,
  );
  if (!rosterResponse.ok) throw new Error("Teacher roster request failed.");
  const roster = (await rosterResponse.json()) as Array<{ email: string }>;
  if (!roster.some((member) => member.email === "student@sqweb.local")) {
    throw new Error("Enrolled Student was not present in the roster.");
  }

  const forbiddenRoster = await api(
    studentToken,
    `/v1/classes/${classId}/roster`,
  );
  if (forbiddenRoster.status !== 403)
    throw new Error("Student roster access was not denied.");

  console.log(`SQWeb local smoke test passed for class ${classId}.`);
  console.log(
    "Verified: Auth, API, MySQL, class creation, invitation, enrollment, roster, and role denial.",
  );
}

void main();
