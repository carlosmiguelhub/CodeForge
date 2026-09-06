export interface WebPreviewFileNode {
  readonly id: string;
  readonly kind: "file";
  readonly name: string;
  readonly sourceCode: string;
}

export interface WebPreviewFolderNode {
  readonly id: string;
  readonly kind: "folder";
  readonly children: readonly WebPreviewNode[];
}

export type WebPreviewNode = WebPreviewFileNode | WebPreviewFolderNode;

export function filesByNameInTreeOrder(
  root: WebPreviewFolderNode,
): Map<string, WebPreviewFileNode> {
  const files = new Map<string, WebPreviewFileNode>();

  function visit(node: WebPreviewNode) {
    if (node.kind === "file") {
      const key = node.name.toLowerCase();
      // The v1 linking rule is explicitly first-in-tree-order wins.
      if (!files.has(key)) files.set(key, node);
      return;
    }
    for (const child of node.children) visit(child);
  }

  visit(root);
  return files;
}

export function preferredHtmlFile(
  root: WebPreviewFolderNode,
): WebPreviewFileNode | null {
  const files = [...filesByNameInTreeOrder(root).values()].filter((file) =>
    file.name.toLowerCase().endsWith(".html"),
  );
  return (
    files.find((file) => file.name.toLowerCase() === "index.html") ??
    files[0] ??
    null
  );
}

function referencedFileName(reference: string | null): string | null {
  const value = reference?.trim();
  if (!value || value.startsWith("//")) return null;
  // Absolute external URLs and non-network schemes are not workspace files,
  // even if their final basename happens to match one.
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return null;

  const path = value.split(/[?#]/, 1)[0]?.replaceAll("\\", "/");
  const encodedName = path?.split("/").filter(Boolean).pop();
  if (!encodedName) return null;
  try {
    return decodeURIComponent(encodedName).toLowerCase();
  } catch {
    return encodedName.toLowerCase();
  }
}

function protectRawTextClosingTag(source: string, element: "script" | "style") {
  // HTML serialization does not escape closing tags inside raw-text elements.
  // Escaping the slash keeps authored strings such as "</script>" from ending
  // the generated element early while preserving their JavaScript/CSS value.
  return source.replace(new RegExp(`</${element}`, "gi"), `<\\/${element}`);
}

export function assemblePreviewDocument(
  entryHtml: string,
  filesByName: ReadonlyMap<string, WebPreviewFileNode>,
): string {
  const doc = new DOMParser().parseFromString(entryHtml, "text/html");

  doc.querySelectorAll("link[href]").forEach((link) => {
    const rel = link.getAttribute("rel")?.toLowerCase().split(/\s+/) ?? [];
    if (!rel.includes("stylesheet")) return;
    const fileName = referencedFileName(link.getAttribute("href"));
    const file = fileName ? filesByName.get(fileName) : undefined;
    if (!file || !file.name.toLowerCase().endsWith(".css")) return;

    const style = doc.createElement("style");
    style.textContent = protectRawTextClosingTag(file.sourceCode, "style");
    link.replaceWith(style);
  });

  doc.querySelectorAll("script[src]").forEach((scriptTag) => {
    const fileName = referencedFileName(scriptTag.getAttribute("src"));
    const file = fileName ? filesByName.get(fileName) : undefined;
    if (!file || !file.name.toLowerCase().endsWith(".js")) return;

    const script = doc.createElement("script");
    for (const attribute of scriptTag.attributes) {
      if (attribute.name !== "src")
        script.setAttribute(attribute.name, attribute.value);
    }
    script.textContent = protectRawTextClosingTag(file.sourceCode, "script");
    scriptTag.replaceWith(script);
  });

  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}
