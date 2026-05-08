// Setup global appliqué avant chaque suite de tests.
// Fixe les variables d'environnement requises par les modules testés.

import { webcrypto } from "node:crypto";

// 32 bytes = 64 hex chars, requis par lib/crypto.ts.
process.env.ENCRYPTION_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// Node 18 n'expose pas `globalThis.crypto` par défaut (Node 19+ le fait).
// otplib (via @noble/hashes) en a besoin pour `getRandomValues`. Le runtime
// prod (Node 22 dans Docker) n'a pas ce souci.
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

// (NODE_ENV est en lecture seule en TS — vitest le fixe à "test" tout seul.)
