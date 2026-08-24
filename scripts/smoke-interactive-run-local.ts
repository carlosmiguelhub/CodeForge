import { once } from "node:events";

import {
  interactiveRunServerMessageSchema,
  type CodeLanguage,
} from "@sqweb/contracts";
import { ExecutionGrantSigner } from "@sqweb/execution";
import Docker from "dockerode";
import WebSocket from "ws";

import { DockerInteractiveRunManager } from "../apps/interactive-run-api/src/interactive-runner";
import { buildInteractiveRunServer } from "../apps/interactive-run-api/src/server";

const secret = "local-smoke-secret-that-is-at-least-32-characters";
const account = {
  id: "00000000-0000-4000-8000-000000000010",
  firebaseUid: "smoke-user",
  email: "smoke@example.edu",
  displayName: "Smoke User",
  institutionId: "00000000-0000-4000-8000-000000000001",
  status: "active" as const,
  roles: ["student" as const],
  sectionId: null,
  authorizationVersion: 1,
};

const programs: Readonly<Record<CodeLanguage, string>> = {
  python: [
    'name = input("Name: ")',
    'age = input("Age: ")',
    'print(f"Hello {name}, age {age}")',
  ].join("\n"),
  java: [
    "import java.util.Scanner;",
    "public class Main {",
    "  public static void main(String[] args) {",
    "    Scanner scanner = new Scanner(System.in);",
    '    System.out.print("Name: ");',
    "    String name = scanner.nextLine();",
    '    System.out.print("Age: ");',
    "    String age = scanner.nextLine();",
    '    System.out.println("Hello " + name + ", age " + age);',
    "  }",
    "}",
  ].join("\n"),
  c: [
    "#include <stdio.h>",
    "int main(void) {",
    "  char name[64]; int age;",
    '  printf("Name: ");',
    '  if (scanf(" %63[^\\n]", name) != 1) return 1;',
    '  printf("Age: ");',
    '  if (scanf("%d", &age) != 1) return 1;',
    '  printf("Hello %s, age %d\\n", name, age);',
    "  return 0;",
    "}",
  ].join("\n"),
  cpp: [
    "#include <iostream>",
    "#include <string>",
    "int main() {",
    "  std::string name, age;",
    '  std::cout << "Name: ";',
    "  std::getline(std::cin, name);",
    '  std::cout << "Age: ";',
    "  std::getline(std::cin, age);",
    '  std::cout << "Hello " << name << ", age " << age << "\\n";',
    "}",
  ].join("\n"),
  javascript: [
    'const readline = require("readline");',
    "const rl = readline.createInterface({ input: process.stdin, output: process.stdout });",
    'rl.question("Name: ", (name) => {',
    '  rl.question("Age: ", (age) => {',
    '    console.log("Hello " + name + ", age " + age);',
    "    rl.close();",
    "  });",
    "});",
  ].join("\n"),
};

async function main() {
  const signer = new ExecutionGrantSigner(secret);
  const runs = new DockerInteractiveRunManager(
    {
      imageTag: "sqweb/code-runtime:local",
      memoryLimitMb: 512,
      cpuLimit: "1000m",
    },
    new Docker(),
  );
  const server = await buildInteractiveRunServer({
    grantSigner: signer,
    runs,
    maxRuntimeSeconds: 30,
    logger: false,
  });
  const sockets = new Set<WebSocket>();

  function waitUntil(
    check: () => boolean,
    subscribe: (resolve: () => void) => () => void,
    description: string,
  ) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for ${description}`)),
        15_000,
      );
      const unsubscribe = subscribe(evaluate);
      function evaluate() {
        try {
          if (!check()) return;
          clearTimeout(timer);
          unsubscribe();
          resolve();
        } catch (error) {
          clearTimeout(timer);
          unsubscribe();
          reject(error);
        }
      }
      evaluate();
    });
  }

  try {
    await server.listen({ host: "127.0.0.1", port: 0 });
    const address = server.server.address();
    if (!address || typeof address === "string")
      throw new Error("NO_SMOKE_PORT");

    for (const language of Object.keys(programs) as CodeLanguage[]) {
      const token = signer.issueInteractiveRun(account, 60).token;
      const socket = new WebSocket(
        `ws://127.0.0.1:${address.port}/v1/interactive-runs?token=${encodeURIComponent(token)}`,
      );
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
      await once(socket, "open");

      let output = "";
      let exitCode: number | undefined;
      let serverError: string | undefined;
      const listeners = new Set<() => void>();
      socket.on("message", (data) => {
        const message = interactiveRunServerMessageSchema.parse(
          JSON.parse(data.toString()),
        );
        if (message.type === "stdout" || message.type === "stderr")
          output += message.data;
        if (message.type === "exit") exitCode = message.exitCode;
        if (message.type === "error") serverError = message.message;
        for (const listener of listeners) listener();
      });
      const subscribe = (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      };
      const hasOutput = (expected: string) => {
        if (serverError) throw new Error(serverError);
        if (output.includes(expected)) return true;
        if (exitCode !== undefined)
          throw new Error(
            `${language} exited with ${exitCode} before ${JSON.stringify(expected)}; output=${JSON.stringify(output)}`,
          );
        return false;
      };

      socket.send(
        JSON.stringify({
          type: "start",
          language,
          sourceCode: programs[language],
        }),
      );
      await waitUntil(
        () => hasOutput("Name: "),
        subscribe,
        `${language} first prompt before stdin`,
      );
      socket.send(JSON.stringify({ type: "stdin", data: "Ada Lovelace\n" }));
      await waitUntil(
        () => hasOutput("Age: "),
        subscribe,
        `${language} second prompt before stdin`,
      );
      socket.send(JSON.stringify({ type: "stdin", data: "37\n" }));
      await waitUntil(
        () => hasOutput("Hello Ada Lovelace, age 37"),
        subscribe,
        `${language} final output`,
      );
      await waitUntil(
        () => {
          if (serverError) throw new Error(serverError);
          return exitCode !== undefined;
        },
        subscribe,
        `${language} exit frame`,
      );
      if (exitCode !== 0)
        throw new Error(`${language} exited with ${exitCode}`);
      console.log(`${language}: interactive prompts passed`);
      if (socket.readyState !== WebSocket.CLOSED) await once(socket, "close");
    }
  } finally {
    for (const socket of sockets) socket.terminate();
    await server.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
