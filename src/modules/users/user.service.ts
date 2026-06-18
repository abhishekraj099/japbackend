import { db } from "../../config/database.js";
import { AppError } from "../../lib/errors/AppError.js";
import { UpdateUserInput } from "./user.schema.js";

export class UserService {
  async getProfile(userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    if (!user) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }

    return user;
  }

  async updateProfile(userId: string, input: UpdateUserInput) {
    const user = await db.user.update({
      where: { id: userId },
      data: input,
      select: { id: true, email: true, name: true },
    });

    return user;
  }

  async deleteAccount(userId: string) {
    await db.user.delete({ where: { id: userId } });
  }
}
