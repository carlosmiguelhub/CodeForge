import type { AccountProfile, AuditSink, VerifiedIdentity } from "@sqweb/auth";
import type {
  ErdDiagram,
  ErdDiagramContent,
  ErdDiagramSummary,
} from "@sqweb/contracts";

export interface ErdDiagramRepository {
  listOwned(ownerId: string): Promise<readonly ErdDiagramSummary[]>;
  findOwned(id: string, ownerId: string): Promise<ErdDiagram | null>;
  create(input: {
    institutionId: string;
    ownerId: string;
    name: string;
    content: ErdDiagramContent;
  }): Promise<ErdDiagram>;
  rename(id: string, ownerId: string, name: string): Promise<ErdDiagram>;
  saveContent(
    id: string,
    ownerId: string,
    content: ErdDiagramContent,
  ): Promise<ErdDiagram>;
  remove(id: string, ownerId: string): Promise<void>;
}

export interface ErdServiceDependencies {
  identity: {
    requireActiveAccount(
      identity: VerifiedIdentity,
      roles?: readonly ("student" | "teacher" | "administrator")[],
    ): Promise<AccountProfile>;
  };
  diagrams: ErdDiagramRepository;
  audit: AuditSink;
}
