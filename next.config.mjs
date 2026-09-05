/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['pdfkit', 'exceljs', 'pdf-parse'],
  experimental: {
    // Certificate extraction can run long; give server actions room for bulk uploads.
    serverActions: { bodySizeLimit: '25mb' },
  },
};
export default nextConfig;
