/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep native / heavy server packages out of the bundler:
  // `pg` (database driver) and Transformers.js + ONNX Runtime (embeddings).
  experimental: {
    serverComponentsExternalPackages: ['pg', '@huggingface/transformers', 'onnxruntime-node', 'sharp'],
  },
};

export default nextConfig;
