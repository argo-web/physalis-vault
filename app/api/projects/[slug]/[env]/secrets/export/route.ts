import { requireEnvironment } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

type Params = { params: Promise<{ slug: string; env: string }> };

// GET /api/projects/[slug]/[env]/secrets/export
// Retourne tous les secrets déchiffrés au format .env (text/plain).
// Accessible dès VIEWER — même niveau que la lecture individuelle.
export async function GET(_req: Request, { params }: Params) {
  const { slug, env } = await params;
  const access = await requireEnvironment(slug, env);
  if ("error" in access) return access.error;

  const secrets = await prisma.secret.findMany({
    where: { environmentId: access.environment.id },
    select: { key: true, category: true, encryptedValue: true, iv: true, tag: true },
    orderBy: [{ category: "asc" }, { key: "asc" }],
  });

  function formatLine(s: { key: string; encryptedValue: string; iv: string; tag: string }): string {
    try {
      const value = decrypt({ encryptedValue: s.encryptedValue, iv: s.iv, tag: s.tag });
      const needsQuotes = /[\s"'\\#$`]/.test(value);
      const escaped = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
      return `${s.key}=${escaped}`;
    } catch {
      return `# ${s.key}= (erreur de déchiffrement)`;
    }
  }

  // Grouper par catégorie — les sans-catégorie à la fin
  const groups = new Map<string | null, typeof secrets>();
  for (const s of secrets) {
    const cat = s.category ?? null;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(s);
  }

  const named = [...groups.keys()].filter((k) => k !== null).sort() as string[];
  const hasCategories = named.length > 0;

  let body: string;

  if (!hasCategories) {
    // Aucune catégorie : sortie plate sans header
    body = secrets.map(formatLine).join("\n") + "\n";
  } else {
    // Catégories nommées en premier (ordre alpha), sans-catégorie à la fin
    const orderedKeys: (string | null)[] = [...named, null];
    const sections: string[] = [];
    for (const cat of orderedKeys) {
      const group = groups.get(cat);
      if (!group || group.length === 0) continue;
      const header = `# ${cat ?? "Sans catégorie"}`;
      const lines = group.map(formatLine);
      sections.push([header, ...lines].join("\n"));
    }
    body = sections.join("\n\n") + "\n";
  }

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename=".env"`,
    },
  });
}
