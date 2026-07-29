/** @type {import("next").NextConfig} */
const nextConfig = {
  // Keep production output separate from source and development artifacts so
  // the npm package contains only the runnable application build.
  distDir: "dist",
};

export default nextConfig;
