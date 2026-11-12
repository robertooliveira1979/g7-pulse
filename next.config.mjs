/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // planilhas de importação e certificados chegam por server action
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};
export default nextConfig;
