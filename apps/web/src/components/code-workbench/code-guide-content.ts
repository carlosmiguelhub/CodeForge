import type { CodeLanguage } from "@sqweb/contracts";

import type { GuideSample } from "../workbench/guide-modal";

export const codeGuideSections = [
  {
    title: "Your programming workspace",
    body: "Write and run Python, Java, C++, JavaScript, or C in isolated containers. Compiled languages report compiler errors, every run streams output into the Console, and a stopped or completed program is cleaned up automatically.",
  },
  {
    title: "Files, folders, and autosave",
    body: 'Use the explorer to create folders such as "Week 1" or "Practice" and place related files inside them. Open files appear as editor tabs, each file remembers its language, and edits are saved automatically after you pause typing.',
  },
  {
    title: "Languages and entry points",
    body: "Choose the active file's language from the toolbar. Java programs must use public class Main because the source runs as Main.java; Python, JavaScript, C, and C++ use their normal single-file entry points.",
  },
  {
    title: "Run through the live Console",
    body: 'Click "Run" or press Ctrl/Cmd + Enter. Output and prompts appear immediately in the Console. When your program waits for input, type one response in the field below the transcript and press Enter; repeat for every question the program asks.',
  },
  {
    title: "Reading text with spaces",
    body: 'CodeForge sends the complete line exactly as typed. Your program still controls how that line is parsed: use nextLine() in Java, getline() in C++, input() in Python, readline in JavaScript, or fgets() in C when spaces must be preserved. C scanf("%s") intentionally stops at the first space.',
  },
  {
    title: "Errors, stopping, and limits",
    body: "Compiler and runtime errors appear in red in the same transcript. Use Stop for a program that is waiting forever or looping. Runs have time, memory, process, input, and output limits, and cannot access the network, so keep exercises self-contained.",
  },
] as const;

export const codeGuideSamples: Readonly<
  Record<CodeLanguage, readonly GuideSample[]>
> = {
  python: [
    {
      label: "Interactive introduction",
      description: "Ask two questions and preserve spaces in the name",
      code: 'name = input("Full name: ")\nage = int(input("Age: "))\nprint(f"Hello, {name}! You are {age} years old.")',
    },
    {
      label: "Sum 1 to N",
      description: "Read a number, loop, print the sum",
      code: 'n = int(input("Enter N: "))\ntotal = 0\nfor i in range(1, n + 1):\n    total += i\nprint(f"Sum: {total}")',
    },
  ],
  java: [
    {
      label: "Interactive introduction",
      description: "Ask two questions using full-line input",
      code: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        System.out.print("Full name: ");\n        String name = scanner.nextLine();\n        System.out.print("Age: ");\n        int age = Integer.parseInt(scanner.nextLine());\n        System.out.println("Hello, " + name + "! You are " + age + ".");\n        scanner.close();\n    }\n}',
    },
    {
      label: "Sum 1 to N",
      description: "Read a number, loop, print the sum",
      code: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        System.out.print("Enter N: ");\n        int n = Integer.parseInt(scanner.nextLine());\n        int total = 0;\n        for (int i = 1; i <= n; i++) total += i;\n        System.out.println("Sum: " + total);\n        scanner.close();\n    }\n}',
    },
  ],
  cpp: [
    {
      label: "Interactive introduction",
      description: "Ask two questions and read a name containing spaces",
      code: '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    string name, age;\n    cout << "Full name: ";\n    getline(cin, name);\n    cout << "Age: ";\n    getline(cin, age);\n    cout << "Hello, " << name << "! You are " << age << ".\\n";\n    return 0;\n}',
    },
    {
      label: "Sum 1 to N",
      description: "Read a number, loop, print the sum",
      code: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    cout << "Enter N: ";\n    cin >> n;\n    int total = 0;\n    for (int i = 1; i <= n; i++) total += i;\n    cout << "Sum: " << total << endl;\n    return 0;\n}',
    },
  ],
  javascript: [
    {
      label: "Interactive introduction",
      description: "Ask two questions with Node's readline interface",
      code: 'const readline = require("readline");\nconst rl = readline.createInterface({ input: process.stdin, output: process.stdout });\n\nrl.question("Full name: ", (name) => {\n  rl.question("Age: ", (age) => {\n    console.log(`Hello, ${name}! You are ${age}.`);\n    rl.close();\n  });\n});',
    },
    {
      label: "Sum 1 to N",
      description: "Read a number, loop, print the sum",
      code: 'const readline = require("readline");\nconst rl = readline.createInterface({ input: process.stdin, output: process.stdout });\n\nrl.question("Enter N: ", (answer) => {\n  const n = Number(answer);\n  let total = 0;\n  for (let i = 1; i <= n; i++) total += i;\n  console.log(`Sum: ${total}`);\n  rl.close();\n});',
    },
  ],
  c: [
    {
      label: "Interactive introduction",
      description: "Use fgets so a full name can contain spaces",
      code: '#include <stdio.h>\n#include <string.h>\n\nint main(void) {\n    char name[100];\n    int age;\n\n    printf("Full name: ");\n    fgets(name, sizeof(name), stdin);\n    name[strcspn(name, "\\n")] = \'\\0\';\n\n    printf("Age: ");\n    scanf("%d", &age);\n    printf("Hello, %s! You are %d.\\n", name, age);\n    return 0;\n}',
    },
    {
      label: "Sum 1 to N",
      description: "Read a number, loop, print the sum",
      code: '#include <stdio.h>\n\nint main(void) {\n    int n, total = 0;\n    printf("Enter N: ");\n    scanf("%d", &n);\n    for (int i = 1; i <= n; i++) total += i;\n    printf("Sum: %d\\n", total);\n    return 0;\n}',
    },
  ],
};
