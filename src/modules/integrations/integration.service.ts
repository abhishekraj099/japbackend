import { db } from "../../config/database.js";

/**
 * External integrations (Anki and, in future, cloud-storage providers).
 *
 * This phase only records a connection's status — there is NO card/review sync,
 * no OAuth and no external API calls. `provider` is a free-form string and the
 * table has no provider-specific columns, so adding providers needs no schema
 * change.
 */
export class IntegrationService {
  /** All of a user's integrations (newest first). */
  async getAll(userId: string) {
    return await db.integration.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Mark a provider connected, creating the row on first connect. */
  async connect(userId: string, provider: string) {
    return await db.integration.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, status: "connected" },
      update: { status: "connected" },
    });
  }

  /** Mark a provider disconnected (idempotent — creates a disconnected row if
   *  none exists so the response shape is always consistent). */
  async disconnect(userId: string, provider: string) {
    return await db.integration.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, status: "disconnected" },
      update: { status: "disconnected" },
    });
  }
}
