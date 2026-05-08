import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/lib/**/*.test.ts"],
    exclude: ["tests/integ/**"],
    // Pas de DB requise pour la tier unit. Setup global pour fixer les
    // variables d'environnement nécessaires (ENCRYPTION_KEY).
    setupFiles: ["./tests/setup.ts"],
    // Les modules avec état partagé (rate-limit) sont testés avec des scopes
    // distincts par cas, donc pas besoin d'isoler les modules.
    pool: "threads",
    reporters: ["default"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
