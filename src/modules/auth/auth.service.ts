import { db } from "../../config/database.js";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors/AppError.js";
import { RegisterInput, LoginInput } from "./auth.schema.js";
import jwt, { SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";

export class AuthService {
  async register(input: RegisterInput) {
    const existing = await db.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new AppError(409, "Email already in use", "EMAIL_EXISTS");
    }

    const hashedPassword = await bcrypt.hash(input.password, 10);

    const user = await db.user.create({
      data: {
        email: input.email,
        passwordHash: hashedPassword,
        name: input.name,
      },
    });

    const signOptions: SignOptions = { expiresIn: env.JWT_EXPIRE as SignOptions["expiresIn"] };
    const token = jwt.sign({ id: user.id, email: user.email }, env.JWT_SECRET, signOptions);

    return { user: { id: user.id, email: user.email, name: user.name }, token };
  }

  async login(input: LoginInput) {
    const user = await db.user.findUnique({ where: { email: input.email } });
    if (!user) {
      throw new AppError(401, "Invalid credentials", "INVALID_CREDENTIALS");
    }

    const validPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!validPassword) {
      throw new AppError(401, "Invalid credentials", "INVALID_CREDENTIALS");
    }

    const signOptions: SignOptions = { expiresIn: env.JWT_EXPIRE as SignOptions["expiresIn"] };
    const token = jwt.sign({ id: user.id, email: user.email }, env.JWT_SECRET, signOptions);

    return { user: { id: user.id, email: user.email, name: user.name }, token };
  }
}
