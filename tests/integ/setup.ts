// Setup global pour les tests d'intégration. Vérifie que la stack est up
// avant de lancer la suite.

import { beforeAll } from "vitest";
import { BASE_URL } from "./helpers/api";

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE_URL}/login`);
    if (res.status !== 200) {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    throw new Error(
      `La stack live (${BASE_URL}) ne répond pas. Lancez 'docker compose up -d' avant 'npm run test:integ'.\n${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
});
