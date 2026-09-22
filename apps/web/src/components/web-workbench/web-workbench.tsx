"use client";

import {
  WEB_IMAGE_MAX_BYTES,
  webFileKindFromName,
  webFileKindMeta,
  webFileNameSchema,
  webFolderNameSchema,
  webImageFileNameSchema,
  webWorkspaceSchema,
} from "@sqweb/contracts";
import {
  Braces,
  ChevronDown,
  ChevronRight,
  Expand,
  File,
  FilePlus2,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  Globe,
  Image as ImageIcon,
  ImagePlus,
  Maximize2,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { CodeEditor } from "@/components/code-workbench/code-editor";
import { Spinner } from "@/components/ui/spinner";
import { randomId } from "@/lib/random-id";
import {
  collectFileIds,
  findNode,
  insertChild,
  mapNode,
  removeNode,
} from "@/lib/tree-nodes";
import {
  assemblePreviewDocument,
  filesByNameInTreeOrder,
  preferredHtmlFile,
} from "@/lib/web-preview";

interface WebFileNode {
  readonly id: string;
  readonly kind: "file";
  name: string;
  sourceCode: string;
}

interface WebFolderNode {
  readonly id: string;
  readonly kind: "folder";
  name: string;
  children: WebNode[];
}

type WebNode = WebFileNode | WebFolderNode;

interface Draft {
  parentId: string;
  kind: "file" | "folder";
  name: string;
  error: string | null;
}

const ROOT_ID = "root";
const MAX_OPEN_FILES = 100;
const FILE_NAME_ERROR = "File name must end in .html, .css, or .js";
const WEB_IMAGE_MAX_KB = Math.floor(WEB_IMAGE_MAX_BYTES / 1000);
const IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/svg+xml,image/webp";

function defaultSource(name: string): string {
  switch (webFileKindFromName(name)) {
    case "html":
      return '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>New page</title>\n</head>\n<body>\n\n</body>\n</html>\n';
    case "css":
      return "";
    case "javascript":
      return "";
    default:
      return "";
  }
}

function validationMessage(
  result: ReturnType<typeof webFileNameSchema.safeParse>,
) {
  return result.success
    ? null
    : (result.error.issues[0]?.message ?? FILE_NAME_ERROR);
}

export function WebWorkbench() {
  const { authorizedFetch } = useAuth();
  const [root, setRoot] = useState<WebFolderNode>(() => ({
    id: ROOT_ID,
    kind: "folder",
    name: "My files",
    children: [],
  }));
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [openFileIds, setOpenFileIds] = useState<string[]>([]);
  const [activeFileId, setActiveFileId] = useState("");
  const [previewFileId, setPreviewFileId] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadTargetRef = useRef(ROOT_ID);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(248);
  const [fullScreen, setFullScreen] = useState(false);
  const [mobileFilesOpen, setMobileFilesOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await authorizedFetch("/v1/web-workspace");
        if (!response.ok)
          throw new Error("The web workspace could not be loaded.");
        const workspace = webWorkspaceSchema.parse(await response.json());
        if (cancelled) return;
        const loadedRoot = workspace.content.root as WebFolderNode;
        setRoot(loadedRoot);
        setExpanded(new Set(workspace.content.expanded));
        setOpenFileIds([...workspace.content.openFileIds]);
        setActiveFileId(workspace.content.activeFileId);
        setPreviewFileId(preferredHtmlFile(loadedRoot)?.id ?? "");
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

  // Saves are queued so an older, slower PUT can never arrive after a newer
  // one and overwrite the student's latest tree.
  useEffect(() => {
    if (loadState !== "ready") return;
    const revision = ++saveRevisionRef.current;
    const statusTimer = window.setTimeout(() => setSaveStatus("saving"), 0);
    const content = {
      root,
      expanded: [...expanded],
      openFileIds,
      activeFileId,
    };
    const saveTimer = window.setTimeout(() => {
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            const response = await authorizedFetch("/v1/web-workspace", {
              method: "PUT",
              body: JSON.stringify({ content }),
            });
            if (revision === saveRevisionRef.current)
              setSaveStatus(response.ok ? "saved" : "error");
          } catch {
            if (revision === saveRevisionRef.current) setSaveStatus("error");
          }
        });
    }, 300);
    return () => {
      window.clearTimeout(statusTimer);
      window.clearTimeout(saveTimer);
    };
  }, [authorizedFetch, loadState, root, expanded, openFileIds, activeFileId]);

  const activeNode = activeFileId
    ? findNode<WebFileNode, WebFolderNode>(root, activeFileId)
    : null;
  const activeFile: WebFileNode | null =
    activeNode?.kind === "file" ? activeNode : null;
  const previewNode = previewFileId
    ? findNode<WebFileNode, WebFolderNode>(root, previewFileId)
    : null;
  const previewFile: WebFileNode | null =
    previewNode?.kind === "file" &&
    webFileKindFromName(previewNode.name) === "html"
      ? previewNode
      : null;
  const openFiles = openFileIds
    .map((id) => findNode<WebFileNode, WebFolderNode>(root, id))
    .filter((node): node is WebFileNode => node?.kind === "file");

  // Only recomputed while the overlay is open — no reason to re-assemble the
  // document on every keystroke when nobody can see it.
  useEffect(() => {
    if (!previewFile || !previewOpen) return;
    const timer = window.setTimeout(() => {
      setPreviewHtml(
        assemblePreviewDocument(
          previewFile.sourceCode,
          filesByNameInTreeOrder(root),
        ),
      );
      setPreviewVersion((value) => value + 1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [previewFile, root, previewOpen]);

  function refreshPreview() {
    if (!previewFile) return;
    setPreviewHtml(
      assemblePreviewDocument(
        previewFile.sourceCode,
        filesByNameInTreeOrder(root),
      ),
    );
    setPreviewVersion((value) => value + 1);
  }

  function openPreview() {
    if (!previewFile) return;
    refreshPreview();
    setPreviewOpen(true);
  }

  function updateActiveSource(sourceCode: string) {
    if (!activeFileId) return;
    setRoot(
      (current) =>
        mapNode(current, activeFileId, (node) =>
          node.kind === "file" ? { ...node, sourceCode } : node,
        ) as WebFolderNode,
    );
  }

  function openFile(id: string) {
    setOpenFileIds((current) =>
      current.includes(id) ? current : [...current, id].slice(-MAX_OPEN_FILES),
    );
    setActiveFileId(id);
    const node = findNode<WebFileNode, WebFolderNode>(root, id);
    if (node?.kind === "file" && webFileKindFromName(node.name) === "html")
      setPreviewFileId(id);
    setMobileFilesOpen(false);
  }

  function activateTab(id: string) {
    setActiveFileId(id);
    const node = findNode<WebFileNode, WebFolderNode>(root, id);
    if (node?.kind === "file" && webFileKindFromName(node.name) === "html")
      setPreviewFileId(id);
  }

  function closeTab(id: string) {
    const next = openFileIds.filter((fileId) => fileId !== id);
    setOpenFileIds(next);
    if (id === activeFileId) {
      const nextId = next[next.length - 1] ?? "";
      setActiveFileId(nextId);
      const nextNode = nextId
        ? findNode<WebFileNode, WebFolderNode>(root, nextId)
        : null;
      if (
        nextNode?.kind === "file" &&
        webFileKindFromName(nextNode.name) === "html"
      )
        setPreviewFileId(nextId);
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startCreate(parentId: string, kind: "file" | "folder") {
    setExpanded((current) => new Set(current).add(parentId));
    setDraft({
      parentId,
      kind,
      name: kind === "file" ? "index.html" : "",
      error: null,
    });
  }

  function commitDraft() {
    if (!draft) return;
    const name = draft.name.trim();
    const parsed =
      draft.kind === "file"
        ? webFileNameSchema.safeParse(name)
        : webFolderNameSchema.safeParse(name);
    if (!parsed.success) {
      setDraft({
        ...draft,
        error:
          draft.kind === "file"
            ? validationMessage(webFileNameSchema.safeParse(name))
            : (parsed.error.issues[0]?.message ?? "Enter a folder name."),
      });
      return;
    }

    const node: WebNode =
      draft.kind === "folder"
        ? { id: randomId(), kind: "folder", name: parsed.data, children: [] }
        : {
            id: randomId(),
            kind: "file",
            name: parsed.data,
            sourceCode: defaultSource(parsed.data),
          };
    setRoot(
      (current) => insertChild(current, draft.parentId, node) as WebFolderNode,
    );
    if (node.kind === "file") {
      setOpenFileIds((current) => [...current, node.id].slice(-MAX_OPEN_FILES));
      setActiveFileId(node.id);
      if (webFileKindFromName(node.name) === "html") {
        setPreviewFileId(node.id);
        setPreviewHtml("");
      }
    } else {
      setExpanded((current) => new Set(current).add(node.id));
    }
    setDraft(null);
  }

  function startUpload(parentId: string) {
    setUploadError(null);
    uploadTargetRef.current = parentId;
    imageInputRef.current?.click();
  }

  function handleImageSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const parsedName = webImageFileNameSchema.safeParse(file.name);
    if (!parsedName.success) {
      setUploadError(
        parsedName.error.issues[0]?.message ?? "That file isn't an image.",
      );
      return;
    }
    if (file.size > WEB_IMAGE_MAX_BYTES) {
      setUploadError(
        `${file.name} is too large — images must be under ${WEB_IMAGE_MAX_KB}KB.`,
      );
      return;
    }

    setUploadError(null);
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setUploading(false);
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        setUploadError(`${file.name} could not be read.`);
        return;
      }
      const node: WebFileNode = {
        id: randomId(),
        kind: "file",
        name: parsedName.data,
        sourceCode: dataUrl,
      };
      const parentId = uploadTargetRef.current;
      setExpanded((current) => new Set(current).add(parentId));
      setRoot(
        (current) => insertChild(current, parentId, node) as WebFolderNode,
      );
      setOpenFileIds((current) => [...current, node.id].slice(-MAX_OPEN_FILES));
      setActiveFileId(node.id);
    };
    reader.onerror = () => {
      setUploading(false);
      setUploadError(`${file.name} could not be read.`);
    };
    reader.readAsDataURL(file);
  }

  function deleteNode(id: string) {
    const node = findNode<WebFileNode, WebFolderNode>(root, id);
    if (!node) return;
    const removedFileIds = new Set(collectFileIds(node));
    const nextRoot = removeNode(root, id) as WebFolderNode;
    setRoot(nextRoot);
    const next = openFileIds.filter((fileId) => !removedFileIds.has(fileId));
    setOpenFileIds(next);
    if (removedFileIds.has(activeFileId))
      setActiveFileId(next[next.length - 1] ?? "");
    if (removedFileIds.has(previewFileId)) {
      const fallbackId = preferredHtmlFile(nextRoot)?.id ?? "";
      setPreviewFileId(fallbackId);
      if (!fallbackId) setPreviewHtml("");
    }
  }

  function startRename(node: WebNode) {
    setRenamingId(node.id);
    setRenameValue(node.name);
    setRenameError(null);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameError(null);
  }

  function commitRename() {
    if (!renamingId) return;
    const node = findNode<WebFileNode, WebFolderNode>(root, renamingId);
    if (!node) return cancelRename();
    const name = renameValue.trim();
    // A rename keeps a file within its current kind's extension family —
    // an image stays an image (its content is a data URL, not source
    // text) and vice versa, rather than the general "New file" schema
    // (html/css/js only) that would reject renaming an uploaded image.
    const fileNameSchema =
      node.kind === "file" && webFileKindFromName(node.name) === "image"
        ? webImageFileNameSchema
        : webFileNameSchema;
    const parsed =
      node.kind === "file"
        ? fileNameSchema.safeParse(name)
        : webFolderNameSchema.safeParse(name);
    if (!parsed.success) {
      setRenameError(
        node.kind === "file"
          ? validationMessage(fileNameSchema.safeParse(name))
          : (parsed.error.issues[0]?.message ?? "Enter a folder name."),
      );
      return;
    }
    const nextRoot = mapNode(root, renamingId, (currentNode) => ({
      ...currentNode,
      name: parsed.data,
    })) as WebFolderNode;
    setRoot(nextRoot);
    if (
      node.kind === "file" &&
      webFileKindFromName(parsed.data) === "html" &&
      node.id === activeFileId
    ) {
      setPreviewFileId(node.id);
    } else if (
      node.id === previewFileId &&
      (node.kind !== "file" || webFileKindFromName(parsed.data) !== "html")
    ) {
      const fallbackId = preferredHtmlFile(nextRoot)?.id ?? "";
      setPreviewFileId(fallbackId);
      if (!fallbackId) setPreviewHtml("");
    }
    cancelRename();
  }

  function beginSidebarResize(event: PointerEvent<HTMLDivElement>) {
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const move = (moveEvent: globalThis.PointerEvent) =>
      setSidebarWidth(
        Math.min(420, Math.max(190, startWidth + moveEvent.clientX - startX)),
      );
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function resizeSidebarByKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setSidebarWidth((value) =>
      Math.min(
        420,
        Math.max(190, value + (event.key === "ArrowRight" ? 16 : -16)),
      ),
    );
  }

  function renameInput() {
    return (
      <input
        autoFocus
        value={renameValue}
        aria-invalid={Boolean(renameError)}
        aria-describedby={renameError ? "web-rename-error" : undefined}
        onChange={(event) => {
          setRenameValue(event.target.value);
          setRenameError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") commitRename();
          if (event.key === "Escape") cancelRename();
        }}
        onBlur={commitRename}
        className="border-structural bg-elevated text-ink-primary rounded-control min-h-6 min-w-0 flex-1 border px-1 text-xs outline-none"
      />
    );
  }

  function renderRenameError(depth: number) {
    return renameError ? (
      <p
        id="web-rename-error"
        role="alert"
        className="text-danger py-1 pr-2 text-[10px]"
        style={{ paddingLeft: depth * 14 + 22 }}
      >
        {renameError}
      </p>
    ) : null;
  }

  function renderDraftRow(depth: number) {
    if (!draft) return null;
    return (
      <div
        className="border-structural bg-elevated-high rounded-control my-1 space-y-2 border p-2"
        style={{ marginLeft: depth * 14 + 8 }}
      >
        <p className="text-ink-muted flex items-center gap-1.5 text-[10px] font-semibold uppercase">
          {draft.kind === "folder" ? (
            <FolderClosed aria-hidden="true" size={12} />
          ) : (
            <File aria-hidden="true" size={12} />
          )}
          {draft.kind === "folder" ? "New folder" : "New file"}
        </p>
        <label className="block">
          <span className="text-ink-muted mb-1 block text-[10px] font-medium">
            Name
          </span>
          <input
            autoFocus
            value={draft.name}
            aria-invalid={Boolean(draft.error)}
            aria-describedby={draft.error ? "web-draft-error" : undefined}
            placeholder={draft.kind === "folder" ? "Folder name" : "index.html"}
            onChange={(event) =>
              setDraft((current) =>
                current
                  ? { ...current, name: event.target.value, error: null }
                  : current,
              )
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") commitDraft();
              if (event.key === "Escape") setDraft(null);
            }}
            className="border-structural bg-elevated text-ink-primary rounded-control min-h-8 w-full border px-2 text-xs outline-none"
          />
        </label>
        {draft.error ? (
          <p
            id="web-draft-error"
            role="alert"
            className="text-danger text-[10px]"
          >
            {draft.error}
          </p>
        ) : null}
        <div className="flex justify-end gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="text-ink-muted rounded-control min-h-7 px-2.5 text-[11px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={commitDraft}
            className="bg-action rounded-control min-h-7 px-3 text-[11px] font-semibold text-white"
          >
            Create
          </button>
        </div>
      </div>
    );
  }

  function renderNode(node: WebNode, depth: number) {
    if (node.kind === "folder") {
      const open = expanded.has(node.id);
      const isRenaming = renamingId === node.id;
      return (
        <div key={node.id}>
          <div
            className="group hover:bg-elevated rounded-control flex min-h-8 items-center gap-1 pr-1"
            style={{ paddingLeft: depth * 14 }}
          >
            <button
              type="button"
              onClick={() => toggleExpanded(node.id)}
              aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
              aria-expanded={open}
              className="text-ink-muted grid size-7 shrink-0 place-items-center"
            >
              {open ? (
                <ChevronDown aria-hidden="true" size={12} />
              ) : (
                <ChevronRight aria-hidden="true" size={12} />
              )}
            </button>
            {open ? (
              <FolderOpen
                aria-hidden="true"
                className="text-action-soft shrink-0"
                size={14}
              />
            ) : (
              <FolderClosed
                aria-hidden="true"
                className="text-action-soft shrink-0"
                size={14}
              />
            )}
            {isRenaming ? (
              renameInput()
            ) : (
              <button
                type="button"
                onDoubleClick={() => startRename(node)}
                onClick={() => toggleExpanded(node.id)}
                className="text-ink-secondary min-w-0 flex-1 truncate py-1.5 text-left text-xs font-medium"
              >
                {node.name}
              </button>
            )}
            <div className="flex shrink-0 items-center gap-0.5 lg:hidden lg:group-hover:flex">
              <button
                type="button"
                onClick={() => startCreate(node.id, "file")}
                aria-label={`New file in ${node.name}`}
                className="text-ink-muted grid size-7 place-items-center"
              >
                <FilePlus2 aria-hidden="true" size={12} />
              </button>
              <button
                type="button"
                onClick={() => startCreate(node.id, "folder")}
                aria-label={`New folder in ${node.name}`}
                className="text-ink-muted grid size-7 place-items-center"
              >
                <FolderPlus aria-hidden="true" size={12} />
              </button>
              <button
                type="button"
                onClick={() => startUpload(node.id)}
                aria-label={`Upload image to ${node.name}`}
                className="text-ink-muted grid size-7 place-items-center"
              >
                <ImagePlus aria-hidden="true" size={12} />
              </button>
              <button
                type="button"
                onClick={() => startRename(node)}
                aria-label={`Rename ${node.name}`}
                className="text-ink-muted grid size-7 place-items-center"
              >
                <Pencil aria-hidden="true" size={11} />
              </button>
              <button
                type="button"
                onClick={() => deleteNode(node.id)}
                aria-label={`Delete ${node.name}`}
                className="text-ink-muted hover:text-danger grid size-7 place-items-center"
              >
                <Trash2 aria-hidden="true" size={12} />
              </button>
            </div>
          </div>
          {isRenaming ? renderRenameError(depth) : null}
          {open ? (
            <div>
              {node.children.map((child) => renderNode(child, depth + 1))}
              {draft?.parentId === node.id ? renderDraftRow(depth + 1) : null}
            </div>
          ) : null}
        </div>
      );
    }

    const isActive = node.id === activeFileId;
    const isRenaming = renamingId === node.id;
    const fileKind = webFileKindFromName(node.name);
    return (
      <div key={node.id}>
        <div
          className={`${isActive ? "bg-elevated" : "hover:bg-elevated"} group rounded-control flex min-h-8 items-center gap-1 pr-1`}
          style={{ paddingLeft: depth * 14 + 22 }}
        >
          {fileKind === "image" ? (
            <ImageIcon
              aria-hidden="true"
              className="text-ink-muted shrink-0"
              size={13}
            />
          ) : (
            <File
              aria-hidden="true"
              className="text-ink-muted shrink-0"
              size={13}
            />
          )}
          {isRenaming ? (
            renameInput()
          ) : (
            <button
              type="button"
              onDoubleClick={() => startRename(node)}
              onClick={() => openFile(node.id)}
              className={`${isActive ? "text-ink-primary" : "text-ink-secondary"} flex min-h-8 min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-xs`}
            >
              <span className="truncate">{node.name}</span>
              <span className="text-ink-muted ml-auto font-mono text-[9px] uppercase">
                {fileKind ? webFileKindMeta[fileKind].label : "File"}
              </span>
            </button>
          )}
          <div className="flex shrink-0 items-center gap-0.5 lg:hidden lg:group-hover:flex">
            <button
              type="button"
              onClick={() => startRename(node)}
              aria-label={`Rename ${node.name}`}
              className="text-ink-muted grid size-7 place-items-center"
            >
              <Pencil aria-hidden="true" size={11} />
            </button>
            <button
              type="button"
              onClick={() => deleteNode(node.id)}
              aria-label={`Delete ${node.name}`}
              className="text-ink-muted hover:text-danger grid size-7 place-items-center"
            >
              <Trash2 aria-hidden="true" size={11} />
            </button>
          </div>
        </div>
        {isRenaming ? renderRenameError(depth) : null}
      </div>
    );
  }

  function fileExplorer() {
    return (
      <>
        <div className="border-divider flex items-center justify-between border-b px-3 py-2">
          <span className="text-ink-secondary flex items-center gap-2 text-xs font-semibold">
            <FolderClosed aria-hidden="true" size={14} /> Files
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => startCreate(ROOT_ID, "file")}
              aria-label="New file"
              className="text-ink-muted grid size-8 place-items-center"
            >
              <FilePlus2 aria-hidden="true" size={13} />
            </button>
            <button
              type="button"
              onClick={() => startCreate(ROOT_ID, "folder")}
              aria-label="New folder"
              className="text-ink-muted grid size-8 place-items-center"
            >
              <FolderPlus aria-hidden="true" size={13} />
            </button>
            <button
              type="button"
              onClick={() => startUpload(ROOT_ID)}
              disabled={uploading}
              aria-label="Upload image"
              className="text-ink-muted grid size-8 place-items-center disabled:opacity-50"
            >
              {uploading ? (
                <Spinner size={13} />
              ) : (
                <ImagePlus aria-hidden="true" size={13} />
              )}
            </button>
          </div>
        </div>
        {uploadError ? (
          <p role="alert" className="text-danger px-3 py-1.5 text-[11px]">
            {uploadError}
          </p>
        ) : null}
        <div className="p-2">
          {root.children.length === 0 && !draft ? (
            <p className="text-ink-muted px-2 py-3 text-[11px]">
              No files yet. Create one to get started.
            </p>
          ) : null}
          {root.children.map((child) => renderNode(child, 0))}
          {draft?.parentId === ROOT_ID ? renderDraftRow(0) : null}
        </div>
      </>
    );
  }

  return (
    <section
      className={`${fullScreen ? "bg-canvas fixed inset-0 z-50 p-3" : ""} border-structural bg-deep rounded-panel min-w-0 overflow-hidden border`}
      aria-label="Web Workspace"
    >
      <input
        ref={imageInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        onChange={handleImageSelected}
        className="sr-only"
        aria-label="Choose an image to upload"
      />
      <div className="border-divider bg-surface flex min-h-12 min-w-0 flex-wrap items-center gap-1 border-b px-2 py-1.5">
        <button
          type="button"
          onClick={openPreview}
          disabled={!previewFile}
          className="bg-action rounded-control flex min-h-9 items-center gap-2 px-3 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Globe aria-hidden="true" size={14} /> View result
        </button>
        <button
          type="button"
          onClick={() => setMobileFilesOpen(true)}
          className="border-structural text-ink-secondary rounded-control flex min-h-9 items-center gap-2 border px-3 text-xs lg:hidden"
        >
          <FolderClosed aria-hidden="true" size={14} /> Files
        </button>
        <span className="text-ink-muted ml-auto flex min-w-0 items-center gap-1.5 truncate text-[11px]">
          {loadState === "loading" || saveStatus === "saving" ? (
            <Spinner size={11} />
          ) : null}
          {loadState === "loading"
            ? "Loading your files…"
            : loadState === "error"
              ? "Couldn't load your files"
              : saveStatus === "saving"
                ? "Saving…"
                : saveStatus === "error"
                  ? "Couldn't save"
                  : "Saved"}
        </span>
        <button
          type="button"
          onClick={() => setFullScreen((value) => !value)}
          aria-label={fullScreen ? "Exit full screen" : "Open full screen"}
          className="text-ink-muted rounded-control grid size-9 shrink-0 place-items-center"
        >
          {fullScreen ? (
            <Expand aria-hidden="true" size={15} />
          ) : (
            <Maximize2 aria-hidden="true" size={15} />
          )}
        </button>
      </div>

      <div
        className="flex min-w-0"
        style={{
          height: fullScreen ? "calc(100dvh - 72px)" : "min(680px, 78dvh)",
        }}
      >
        <aside
          className="border-divider bg-sidebar hidden shrink-0 overflow-auto border-r lg:block"
          style={{ width: sidebarWidth }}
          aria-label="File explorer"
        >
          {fileExplorer()}
        </aside>
        <div
          role="separator"
          aria-label="Resize file explorer"
          aria-orientation="vertical"
          aria-valuemin={190}
          aria-valuemax={420}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={beginSidebarResize}
          onKeyDown={resizeSidebarByKeyboard}
          className="bg-divider hover:bg-action hidden w-1 shrink-0 cursor-col-resize touch-none lg:block"
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="border-divider bg-panel flex h-10 shrink-0 items-end overflow-x-auto border-b">
            {openFiles.map((file) => (
              <div
                key={file.id}
                className={`${file.id === activeFileId ? "bg-deep text-ink-primary border-action" : "text-ink-muted border-transparent"} flex h-10 min-w-36 items-center justify-between gap-3 border-t-2 px-3 text-xs`}
              >
                <button
                  type="button"
                  aria-pressed={file.id === activeFileId}
                  onClick={() => activateTab(file.id)}
                  className="flex min-h-8 min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {webFileKindFromName(file.name) === "image" ? (
                    <ImageIcon aria-hidden="true" size={12} />
                  ) : (
                    <Braces aria-hidden="true" size={12} />
                  )}
                  <span className="truncate">{file.name}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Close ${file.name}`}
                  onClick={() => closeTab(file.id)}
                  className="grid size-7 shrink-0 place-items-center"
                >
                  <X aria-hidden="true" size={12} />
                </button>
              </div>
            ))}
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {activeFile && webFileKindFromName(activeFile.name) === "image" ? (
              <div className="bg-canvas grid h-full place-items-center overflow-auto p-6">
                {/* eslint-disable-next-line @next/next/no-img-element --
                    already-inline base64 data URL of unknown, student-set
                    dimensions — next/image's optimizer has nothing to fetch
                    or resize here, so it'd add complexity with no benefit. */}
                <img
                  src={activeFile.sourceCode}
                  alt={activeFile.name}
                  className="max-h-full max-w-full rounded object-contain shadow-sm"
                />
              </div>
            ) : activeFile ? (
              <CodeEditor
                key={activeFile.id}
                value={activeFile.sourceCode}
                language={
                  webFileKindMeta[
                    webFileKindFromName(activeFile.name) ?? "html"
                  ].monacoId
                }
                onChange={updateActiveSource}
                fontSize={13}
              />
            ) : (
              <div className="text-ink-muted grid h-full place-items-center p-8 text-xs">
                <div className="text-center">
                  <FolderOpen
                    aria-hidden="true"
                    className="mx-auto mb-2"
                    size={20}
                  />
                  Select a file from the explorer, or create a new one.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {mobileFilesOpen ? (
        <div
          className="bg-canvas/80 fixed inset-0 z-[55] flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="File explorer"
        >
          <aside className="border-structural bg-sidebar h-full w-[min(88vw,22rem)] overflow-auto border-r">
            <div className="border-divider flex min-h-12 items-center justify-between border-b px-3">
              <span className="text-ink-primary text-sm font-semibold">
                File explorer
              </span>
              <button
                type="button"
                onClick={() => setMobileFilesOpen(false)}
                aria-label="Close file explorer"
                className="text-ink-muted grid size-9 place-items-center"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
            {fileExplorer()}
          </aside>
          <button
            type="button"
            aria-label="Close file explorer"
            className="h-full flex-1"
            onClick={() => setMobileFilesOpen(false)}
          />
        </div>
      ) : null}

      {previewOpen ? (
        <div
          className="bg-canvas fixed inset-0 z-[70] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Preview"
        >
          <div className="border-divider bg-surface text-ink-secondary flex h-12 shrink-0 items-center gap-2 border-b px-3 text-xs font-semibold">
            <Globe aria-hidden="true" size={14} />
            <span className="min-w-0 flex-1 truncate">
              {previewFile ? previewFile.name : "Live preview"}
            </span>
            <button
              type="button"
              onClick={refreshPreview}
              disabled={!previewFile}
              className="text-ink-secondary rounded-control flex min-h-9 items-center gap-1.5 px-2.5 disabled:opacity-50"
            >
              <RefreshCw aria-hidden="true" size={14} /> Refresh
            </button>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              aria-label="Close preview"
              className="text-ink-muted grid size-9 shrink-0 place-items-center"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
          {previewFile && previewHtml ? (
            // Scripts run in an opaque-origin sandbox: no parent DOM,
            // cookies, or storage access. Network requests remain allowed.
            // Remounting gives every refresh a clean execution context.
            <iframe
              key={previewVersion}
              sandbox="allow-scripts"
              srcDoc={previewHtml}
              referrerPolicy="no-referrer"
              title="Live preview"
              className="min-h-0 min-w-0 flex-1 bg-white"
            />
          ) : (
            <div className="text-ink-muted grid min-h-0 flex-1 place-items-center bg-white p-8 text-center text-xs">
              <div>
                <Globe aria-hidden="true" className="mx-auto mb-2" size={20} />
                Create an .html file to see a live preview.
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
