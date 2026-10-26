/** @type {import('next').NextConfig} */
const nextConfig = {
  // `pg` is a native-ish driver — keep it out of the bundler.
  serverExternalPackages: ['pg'],
  experimental: {
    serverComponentsExternalPackages: ['pg'],
  },
};

export default nextConfig;
