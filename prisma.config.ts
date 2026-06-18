import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Migrations use the direct (session-mode) connection, not the pooler
    url: env("DIRECT_URL"),
  },
});
