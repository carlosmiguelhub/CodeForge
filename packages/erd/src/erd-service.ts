import { AuthorizationError } from "@sqweb/auth";
import type { VerifiedIdentity } from "@sqweb/auth";
import type {
  ErdDiagramContent,
  ErdDiagramCreateRequest,
  ErdDiagramRenameRequest,
  ErdDiagramSaveContentRequest,
} from "@sqweb/contracts";

import type { ErdServiceDependencies } from "./types";

const blankDiagram: ErdDiagramContent = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  entityColumns: [],
};

export class ErdService {
  constructor(private readonly dependencies: ErdServiceDependencies) {}

  async listMine(identity: VerifiedIdentity) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    return this.dependencies.diagrams.listOwned(actor.id);
  }

  async createDiagram(
    identity: VerifiedIdentity,
    request: ErdDiagramCreateRequest,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    const diagram = await this.dependencies.diagrams.create({
      institutionId: actor.institutionId,
      ownerId: actor.id,
      name: request.name ?? "Untitled diagram",
      content: request.content ?? blankDiagram,
    });
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "erd_diagram.created",
      targetId: diagram.id,
      result: "succeeded",
    });
    return diagram;
  }

  private async requireOwned(identity: VerifiedIdentity, diagramId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    const diagram = await this.dependencies.diagrams.findOwned(
      diagramId,
      actor.id,
    );
    if (!diagram)
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "ERD diagram not found.",
        404,
      );
    return { actor, diagram };
  }

  async getDiagram(identity: VerifiedIdentity, diagramId: string) {
    const { diagram } = await this.requireOwned(identity, diagramId);
    return diagram;
  }

  async renameDiagram(
    identity: VerifiedIdentity,
    diagramId: string,
    request: ErdDiagramRenameRequest,
  ) {
    const { actor } = await this.requireOwned(identity, diagramId);
    return this.dependencies.diagrams.rename(diagramId, actor.id, request.name);
  }

  async saveContent(
    identity: VerifiedIdentity,
    diagramId: string,
    request: ErdDiagramSaveContentRequest,
  ) {
    const { actor } = await this.requireOwned(identity, diagramId);
    return this.dependencies.diagrams.saveContent(
      diagramId,
      actor.id,
      request.content,
    );
  }

  async deleteDiagram(identity: VerifiedIdentity, diagramId: string) {
    const { actor, diagram } = await this.requireOwned(identity, diagramId);
    await this.dependencies.diagrams.remove(diagramId, actor.id);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "erd_diagram.deleted",
      targetId: diagram.id,
      result: "succeeded",
    });
  }
}
