/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // pdfkit loads its AFM font-metrics via fs relative to its own package;
    // keep it external so node_modules/pdfkit/data/... is resolved at runtime.
    serverComponentsExternalPackages: ["pdfkit"],
  },
};

export default nextConfig;
