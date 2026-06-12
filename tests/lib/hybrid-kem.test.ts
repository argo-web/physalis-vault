import { describe, expect, it } from "vitest";
import { generateEcdhKeypair } from "@/lib/secret-request-crypto";
import {
  hybridDecryptFromSender,
  hybridEncryptForRecipient,
  parsePrivateKey,
  serializeCompositePrivateKey,
  HYBRID_VERSION,
} from "@/lib/hybrid-kem";
import {
  mlKemGenerateKeyPair,
  mlKemEncapsulate,
  mlKemDecapsulate,
  ML_KEM_768,
} from "@/lib/pqc";

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

describe("pqc — ML-KEM-768", () => {
  it("génère des clés aux tailles FIPS 203", () => {
    const { publicKey, secretKey } = mlKemGenerateKeyPair();
    expect(publicKey.length).toBe(ML_KEM_768.publicKeyBytes);
    expect(secretKey.length).toBe(ML_KEM_768.secretKeyBytes);
  });

  it("encapsule/décapsule le même secret partagé", () => {
    const { publicKey, secretKey } = mlKemGenerateKeyPair();
    const { ciphertext, sharedSecret } = mlKemEncapsulate(publicKey);
    expect(ciphertext.length).toBe(ML_KEM_768.ciphertextBytes);
    expect(sharedSecret.length).toBe(ML_KEM_768.sharedSecretBytes);
    const recovered = mlKemDecapsulate(ciphertext, secretKey);
    expect(Buffer.compare(sharedSecret, recovered)).toBe(0);
  });

  it("rejette une clé publique de mauvaise taille", () => {
    expect(() => mlKemEncapsulate(new Uint8Array(10))).toThrow();
  });
});

describe("hybrid-kem — ECDH P-256 + ML-KEM-768 roundtrip", () => {
  async function makeRecipient() {
    const ecdh = await generateEcdhKeypair();
    const mlkem = mlKemGenerateKeyPair();
    return {
      ecdhPublicJwk: ecdh.publicJwk,
      ecdhPrivateJwk: ecdh.privateJwk,
      mlkemPublicB64: b64(mlkem.publicKey),
      mlkemSecretB64: b64(mlkem.secretKey),
    };
  }

  it("chiffre/déchiffre un secret (roundtrip complet)", async () => {
    const r = await makeRecipient();
    const plaintext = "sk_live_pqc_hybrid_secret_42";

    const payload = await hybridEncryptForRecipient(
      plaintext,
      r.ecdhPublicJwk,
      r.mlkemPublicB64,
    );
    expect(payload.hybridVersion).toBe(HYBRID_VERSION);
    expect(payload.ciphertext).toBeTruthy();
    expect(payload.iv).toBeTruthy();
    expect(payload.ephemeralPublicJwk).toBeTruthy();
    expect(payload.mlkemCiphertext).toBeTruthy();

    const decrypted = await hybridDecryptFromSender(
      payload,
      r.ecdhPrivateJwk,
      r.mlkemSecretB64,
    );
    expect(decrypted).toBe(plaintext);
  });

  it("échoue si la clé privée ECDH est fausse (mais ML-KEM correcte)", async () => {
    const r = await makeRecipient();
    const intruder = await generateEcdhKeypair();
    const payload = await hybridEncryptForRecipient("secret", r.ecdhPublicJwk, r.mlkemPublicB64);

    await expect(
      hybridDecryptFromSender(payload, intruder.privateJwk, r.mlkemSecretB64),
    ).rejects.toThrow();
  });

  it("échoue si la clé secrète ML-KEM est fausse (mais ECDH correcte)", async () => {
    const r = await makeRecipient();
    const intruder = mlKemGenerateKeyPair();
    const payload = await hybridEncryptForRecipient("secret", r.ecdhPublicJwk, r.mlkemPublicB64);

    await expect(
      hybridDecryptFromSender(payload, r.ecdhPrivateJwk, b64(intruder.secretKey)),
    ).rejects.toThrow();
  });

  it("échoue si le ciphertext ML-KEM est altéré (binding du transcript)", async () => {
    const r = await makeRecipient();
    const payload = await hybridEncryptForRecipient("secret", r.ecdhPublicJwk, r.mlkemPublicB64);

    const ct = Buffer.from(payload.mlkemCiphertext, "base64");
    ct[0]! ^= 0xff;
    const tampered = { ...payload, mlkemCiphertext: ct.toString("base64") };

    await expect(
      hybridDecryptFromSender(tampered, r.ecdhPrivateJwk, r.mlkemSecretB64),
    ).rejects.toThrow();
  });

  it("supporte unicode et longueurs variables", async () => {
    const r = await makeRecipient();
    for (const plaintext of ["", "a", "🔒 éàù", "x".repeat(4096)]) {
      const payload = await hybridEncryptForRecipient(plaintext, r.ecdhPublicJwk, r.mlkemPublicB64);
      const decrypted = await hybridDecryptFromSender(payload, r.ecdhPrivateJwk, r.mlkemSecretB64);
      expect(decrypted).toBe(plaintext);
    }
  });
});

describe("hybrid-kem — clé privée composite", () => {
  it("sérialise puis parse en hybride", () => {
    const raw = serializeCompositePrivateKey('{"kty":"EC","crv":"P-256","d":"x"}', "bWxrZW0=");
    const parsed = parsePrivateKey(raw);
    expect(parsed.kind).toBe("hybrid");
    if (parsed.kind === "hybrid") {
      expect(parsed.mlkem).toBe("bWxrZW0=");
      expect(JSON.parse(parsed.ecdh).kty).toBe("EC");
    }
  });

  it("détecte une clé JWK ECDH legacy", () => {
    const parsed = parsePrivateKey('{"kty":"EC","crv":"P-256","d":"abc","x":"y","y":"z"}');
    expect(parsed.kind).toBe("legacy");
  });

  it("rejette une saisie non-JSON", () => {
    expect(() => parsePrivateKey("pas du json")).toThrow();
  });
});
