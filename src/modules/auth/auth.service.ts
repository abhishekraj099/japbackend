import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "../../config/database.js";
import { env } from "../../config/env.js";
import logger from "../../config/logger.js";
import { AppError } from "../../lib/errors/AppError.js";
import { RegisterInput, LoginInput } from "./auth.schema.js";
import jwt, { SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";

type UserRow = { id: string; email: string; name: string };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export class AuthService {
  private signAccess(user: { id: string; email: string }): string {
    const opts: SignOptions = { expiresIn: env.ACCESS_TOKEN_TTL as SignOptions["expiresIn"] };
    return jwt.sign({ id: user.id, email: user.email }, env.JWT_SECRET, opts);
  }

  /** Mint an access token + a fresh refresh token within `familyId`. */
  private async issuePair(user: { id: string; email: string }, familyId: string, userAgent?: string) {
    const raw = randomBytes(48).toString("hex");
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000);
    const row = await db.refreshToken.create({
      data: { userId: user.id, tokenHash: sha256(raw), familyId, expiresAt, userAgent },
    });
    return { accessToken: this.signAccess(user), refreshToken: raw, refreshId: row.id };
  }

  private shape(user: UserRow, accessToken: string, refreshToken: string) {
    // `token` is a backward-compatible alias for existing web/extension clients.
    return {
      user: { id: user.id, email: user.email, name: user.name },
      accessToken,
      refreshToken,
      token: accessToken,
    };
  }

  async register(input: RegisterInput, userAgent?: string) {
    const existing = await db.user.findUnique({ where: { email: input.email } });
    if (existing) throw new AppError(409, "Email already in use", "EMAIL_EXISTS");

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await db.user.create({ data: { email: input.email, passwordHash, name: input.name } });
    const { accessToken, refreshToken } = await this.issuePair(user, randomUUID(), userAgent);
    return this.shape(user, accessToken, refreshToken);
  }

  async login(input: LoginInput, userAgent?: string) {
    const user = await db.user.findUnique({ where: { email: input.email } });
    if (!user) throw new AppError(401, "Invalid credentials", "INVALID_CREDENTIALS");
    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) throw new AppError(401, "Invalid credentials", "INVALID_CREDENTIALS");

    const { accessToken, refreshToken } = await this.issuePair(user, randomUUID(), userAgent);
    return this.shape(user, accessToken, refreshToken);
  }

  /** Validate + rotate a refresh token. Replay of a revoked token revokes the
   *  whole family (theft response). */
  async refresh(rawToken: string, userAgent?: string) {
    const tokenHash = sha256(rawToken);
    const row = await db.refreshToken.findUnique({ where: { tokenHash } });
    if (!row) throw new AppError(401, "Invalid refresh token", "INVALID_REFRESH");

    if (row.revokedAt) {
      await db.refreshToken.updateMany({
        where: { familyId: row.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      logger.warn("refresh token reuse detected — family revoked", {
        userId: row.userId,
        familyId: row.familyId,
      });
      throw new AppError(401, "Refresh token reuse detected", "REFRESH_REUSE");
    }
    if (row.expiresAt < new Date()) throw new AppError(401, "Refresh token expired", "REFRESH_EXPIRED");

    const user = await db.user.findUnique({ where: { id: row.userId } });
    if (!user) throw new AppError(401, "Invalid refresh token", "INVALID_REFRESH");

    // Rotate within the family: issue new, revoke + link the old.
    const next = await this.issuePair(user, row.familyId, userAgent);
    await db.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date(), replacedById: next.refreshId },
    });
    return this.shape(user, next.accessToken, next.refreshToken);
  }

  /** Revoke a single refresh token (current device). Idempotent. */
  async logout(rawToken: string) {
    await db.refreshToken.updateMany({
      where: { tokenHash: sha256(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revoke every active refresh token for the user (all devices). */
  async logoutAll(userId: string) {
    await db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
