const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@tidysync/shared"],
  async rewrites() {
    const apiUrl = process.env.API_URL ?? "http://localhost:4000";
    return [
      { source: "/api/graphql", destination: `${apiUrl}/graphql` },
      { source: "/api/upload", destination: `${apiUrl}/upload` },
      { source: "/api/auth", destination: `${apiUrl}/auth` },
      { source: "/download/:path*", destination: `${apiUrl}/download/:path*` },
    ];
  },
};

module.exports = nextConfig;
