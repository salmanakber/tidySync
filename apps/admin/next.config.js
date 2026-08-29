const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../../"),
  basePath: "/admin",
  transpilePackages: ["@tidysync/shared"],
  async rewrites() {
    const apiUrl = process.env.API_URL ?? "http://127.0.0.1:4000";
    return [{ source: "/api/graphql", destination: `${apiUrl}/graphql` }];
  },
};

module.exports = nextConfig;
