/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // pdfkit loads its AFM font-metrics via fs relative to its own package;
    // keep it external so node_modules/pdfkit/data/... is resolved at runtime.
    serverComponentsExternalPackages: ["pdfkit"],
    optimizePackageImports: ["lucide-react", "recharts"],
    // supabase-js optional-imports @opentelemetry/api via a string; Turbopack still resolves it.
    turbo: {
      resolveAlias: {
        "@opentelemetry/api": "./src/lib/otel-stub.mjs",
      },
    },
  },
};

export default nextConfig;
