import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Force Next à embarquer les markdown utilisateur dans la sortie standalone.
  // La layout `/docs` lit `docs/documentation/*.md` via fs.readdir à chaque
  // requête (sidebar) — sans cette directive, Next ne trace pas ces fichiers
  // (path en dehors de l'arbre `app/`) et le runtime échoue avec ENOENT.
  outputFileTracingIncludes: {
    "/docs": ["./docs/documentation/**/*"],
    "/docs/[slug]": ["./docs/documentation/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
