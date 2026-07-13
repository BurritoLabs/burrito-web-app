import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { nodePolyfills } from "vite-plugin-node-polyfills"
import { execFileSync } from "node:child_process"

const getGitRelease = () => {
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
      windowsHide: true
    }).trim()
  } catch {
    return "local"
  }
}

const appRelease =
  process.env.VITE_APP_RELEASE?.trim() ||
  process.env.CF_PAGES_COMMIT_SHA?.slice(0, 12) ||
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
  getGitRelease()

const hasPackage = (id: string, pkg: string) =>
  id.includes(`/node_modules/${pkg}/`) || id.includes(`\\node_modules\\${pkg}\\`)

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BURRITO_RELEASE__: JSON.stringify(appRelease)
  },
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true
      },
      protocolImports: true
    })
  ],
  build: {
    manifest: true,
    minify: "terser",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined

          if (hasPackage(id, "lightweight-charts")) return "chart"
          if (hasPackage(id, "@tanstack/react-query")) return "query"
          if (hasPackage(id, "cosmjs-types")) return "cosmos-proto"
          if (hasPackage(id, "@terra-money")) return "terra-tools"
          if (hasPackage(id, "protobufjs") || hasPackage(id, "long")) {
            return "protobuf"
          }
          if (
            hasPackage(id, "@noble") ||
            hasPackage(id, "bn.js") ||
            hasPackage(id, "elliptic") ||
            hasPackage(id, "hash.js") ||
            hasPackage(id, "hmac-drbg") ||
            hasPackage(id, "inherits") ||
            hasPackage(id, "minimalistic-assert") ||
            hasPackage(id, "minimalistic-crypto-utils") ||
            hasPackage(id, "safe-buffer")
          ) {
            return "crypto-vendor"
          }
          if (
            hasPackage(id, "react-router") ||
            hasPackage(id, "react-router-dom") ||
            hasPackage(id, "react-dom") ||
            hasPackage(id, "react") ||
            hasPackage(id, "scheduler")
          ) {
            return "react-vendor"
          }
          if (hasPackage(id, "qrcode")) return "qrcode"

          return undefined
        }
      }
    }
  },
  server: {
    proxy: {
      "/coingecko": {
        target: "https://api.coingecko.com/api/v3",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/coingecko/, "")
      },
      "/keybase": {
        target: "https://keybase.burrito.money",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/keybase/, "")
      }
    }
  }
})
