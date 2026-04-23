import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  rewrites: async () => {
    return {
      beforeFiles: [
        {
          source: '/api/server/tarot/chat',
          destination: 'https://clotho-server-vyw7.vercel.app/api/tarot',
        }
      ]
    }
  }
};

export default nextConfig;