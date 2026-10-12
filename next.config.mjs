import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['studio', 'ai-agent', 'workflow-builder', 'design-agent'],
  distDir: process.env.NEXT_DIST_DIR || '.next',
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Keep the PostgreSQL client and its Node-only parser dependencies in the
  // server runtime. This is the effective project config; next.config.js is
  // retained by the workspace but is not loaded when next.config.mjs exists.
  serverExternalPackages: ['pg', 'postgres-interval', 'xtend', 'libphonenumber-js', 'nodemailer'],
  async rewrites() {
    return [
      {
        source: '/ai-tool/work-detail/:id',
        destination: '/community/:id',
      },
    ];
  },
};

export default withNextIntl(nextConfig);
