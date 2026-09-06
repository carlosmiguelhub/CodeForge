export interface BaseFileNode {
  readonly id: string;
  readonly kind: "file";
}

export interface BaseFolderNode<TNode> {
  readonly id: string;
  readonly kind: "folder";
  readonly name: string;
  children: TNode[];
}

export function findNode<
  TFile extends BaseFileNode,
  TFolder extends BaseFolderNode<TFile | TFolder>,
>(node: TFile | TFolder, id: string): TFile | TFolder | null {
  if (node.id === id) return node;
  if (node.kind === "folder") {
    for (const child of node.children) {
      const found = findNode<TFile, TFolder>(child, id);
      if (found) return found;
    }
  }
  return null;
}

export function findParentId<
  TFile extends BaseFileNode,
  TFolder extends BaseFolderNode<TFile | TFolder>,
>(node: TFolder, id: string): string | null {
  for (const child of node.children) {
    if (child.id === id) return node.id;
    if (child.kind === "folder") {
      const found = findParentId<TFile, TFolder>(child, id);
      if (found) return found;
    }
  }
  return null;
}

export function mapNode<
  TFile extends BaseFileNode,
  TFolder extends BaseFolderNode<TFile | TFolder>,
>(
  node: TFile | TFolder,
  id: string,
  fn: (node: TFile | TFolder) => TFile | TFolder,
): TFile | TFolder {
  if (node.id === id) return fn(node);
  if (node.kind === "folder") {
    return {
      ...node,
      children: node.children.map((child) =>
        mapNode<TFile, TFolder>(child, id, fn),
      ),
    };
  }
  return node;
}

export function insertChild<
  TFile extends BaseFileNode,
  TFolder extends BaseFolderNode<TFile | TFolder>,
>(
  node: TFile | TFolder,
  parentId: string,
  child: TFile | TFolder,
): TFile | TFolder {
  if (node.kind !== "folder") return node;
  if (node.id === parentId)
    return { ...node, children: [...node.children, child] };
  return {
    ...node,
    children: node.children.map((current) =>
      insertChild<TFile, TFolder>(current, parentId, child),
    ),
  };
}

export function removeNode<
  TFile extends BaseFileNode,
  TFolder extends BaseFolderNode<TFile | TFolder>,
>(node: TFile | TFolder, id: string): TFile | TFolder {
  if (node.kind !== "folder") return node;
  return {
    ...node,
    children: node.children
      .filter((child) => child.id !== id)
      .map((child) => removeNode<TFile, TFolder>(child, id)),
  };
}

export function collectFileIds<
  TFile extends BaseFileNode,
  TFolder extends BaseFolderNode<TFile | TFolder>,
>(node: TFile | TFolder): string[] {
  if (node.kind === "file") return [node.id];
  return node.children.flatMap((child) =>
    collectFileIds<TFile, TFolder>(child),
  );
}
