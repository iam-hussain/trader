/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@trader/schemas"],
  experimental: { typedRoutes: false },
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    return [
      { source: "/api/proxy/:path*", destination: `${api}/:path*` },
    ];
  },
};
export default nextConfig;
