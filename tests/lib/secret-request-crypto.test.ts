import { describe, expect, it } from "vitest";
import {
  decryptFromSender,
  encryptForRecipient,
  generateEcdhKeypair,
} from "@/lib/secret-request-crypto";

describe("secret-request-crypto — ECDH P-256 + AES-GCM roundtrip", () => {
  it("génère une paire ECDH valide (clés JWK exportables)", async () => {
    const pair = await generateEcdhKeypair();
    const pub = JSON.parse(pair.publicJwk) as Record<string, string>;
    const priv = JSON.parse(pair.privateJwk) as Record<string, string>;
    expect(pub.kty).toBe("EC");
    expect(pub.crv).toBe("P-256");
    expect(typeof pub.x).toBe("string");
    expect(typeof pub.y).toBe("string");
    expect(priv.kty).toBe("EC");
    expect(typeof priv.d).toBe("string"); // private scalar
  });

  it("chiffre/déchiffre un secret (roundtrip)", async () => {
    // Côté serveur : génère la paire admin
    const admin = await generateEcdhKeypair();

    // Côté tiers : chiffre avec la clé publique de l'admin
    const plaintext = "sk_live_abc123_super_secret_key";
    const payload = await encryptForRecipient(plaintext, admin.publicJwk);

    expect(payload.ciphertext).toBeTruthy();
    expect(payload.iv).toBeTruthy();
    expect(payload.ephemeralPublicJwk).toBeTruthy();

    // Côté admin : déchiffre avec sa privée + pub éphémère du tiers
    const decrypted = await decryptFromSender(payload, admin.privateJwk);
    expect(decrypted).toBe(plaintext);
  });

  it("rejette un déchiffrement avec la mauvaise clé privée", async () => {
    const admin = await generateEcdhKeypair();
    const intruder = await generateEcdhKeypair();

    const payload = await encryptForRecipient("secret", admin.publicJwk);

    await expect(
      decryptFromSender(payload, intruder.privateJwk),
    ).rejects.toThrow();
  });

  it("rejette un déchiffrement avec un IV altéré", async () => {
    const admin = await generateEcdhKeypair();
    const payload = await encryptForRecipient("secret", admin.publicJwk);

    // Flip un bit dans l'IV
    const tamperedIv = Buffer.from(payload.iv, "base64");
    tamperedIv[0]! ^= 0xff;
    const tampered = { ...payload, iv: tamperedIv.toString("base64") };

    await expect(decryptFromSender(tampered, admin.privateJwk)).rejects.toThrow();
  });

  it("supporte les caractères spéciaux et longueurs variables", async () => {
    const admin = await generateEcdhKeypair();
    const cases = [
      "",
      "a",
      "🔒 émojis et accents éàù",
      "x".repeat(4096),
      JSON.stringify({ nested: { secret: "value", num: 42 } }),
    ];
    for (const plaintext of cases) {
      const payload = await encryptForRecipient(plaintext, admin.publicJwk);
      const decrypted = await decryptFromSender(payload, admin.privateJwk);
      expect(decrypted).toBe(plaintext);
    }
  });
});
