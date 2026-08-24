import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import { institutions, platformSchema } from "./schema";

type Database = MySql2Database<typeof platformSchema>;

export interface InstitutionMaintenanceState {
  readonly enabled: boolean;
  readonly message: string | null;
}

export class MySqlInstitutionRepository {
  constructor(private readonly database: Database) {}

  async getMaintenanceState(
    institutionId: string,
  ): Promise<InstitutionMaintenanceState> {
    const [row] = await this.database
      .select({
        enabled: institutions.maintenanceMode,
        message: institutions.maintenanceMessage,
      })
      .from(institutions)
      .where(eq(institutions.id, institutionId))
      .limit(1);
    return { enabled: row?.enabled ?? false, message: row?.message ?? null };
  }

  async setMaintenanceState(
    institutionId: string,
    enabled: boolean,
    message: string | null,
  ): Promise<void> {
    await this.database
      .update(institutions)
      .set({ maintenanceMode: enabled, maintenanceMessage: message })
      .where(eq(institutions.id, institutionId));
  }
}
