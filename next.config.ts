// import type { NextConfig } from 'next'

// const nextConfig: NextConfig = {
//   // Required for pdf-parse to work in API routes
//   serverExternalPackages: ['pdf-parse', 'mammoth'],
// }

// export default nextConfig

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
