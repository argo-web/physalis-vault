import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Config dédiée aux tests d'intégration HTTP. Séparée de `vitest.config.ts`
 * (tests unitaires) pour pouvoir lancer chacun isolément :
 *   npm test          → unit (rapide, sans dépendance externe)
 *   npm run test:integ → integ (nécessite la stack live)
 *
 * Pré-requis : docker compose up -d (app sur 3001, DB accessible via
 * `docker compose exec db ...` pour les helpers DB direct).
 */
export default defineConfig({
  test: {
    include: ["tests/integ/**/*.test.ts"],
    setupFiles: ["./tests/integ/setup.ts"],
    // Séquentiel : on partage la stack live, les tests créent / suppriment
    // des données. L'isolation se fait par préfixe de noms unique.
    pool: "forks",
    fileParallelism: false,
    sequence: { concurrent: false },
    // Plus généreux que les unit tests (HTTP + docker exec).
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ["default"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
