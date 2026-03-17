import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

const hasPackage = (id: string, pkg: string) =>
  id.includes(`/node_modules/${pkg}/`) || id.includes(`\\node_modules\\${pkg}\\`)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined

          if (hasPackage(id, "lightweight-charts")) return "chart"
          if (hasPackage(id, "@tanstack/react-query")) return "query"
          if (
            hasPackage(id, "@cosmjs") ||
            hasPackage(id, "cosmjs-types") ||
            hasPackage(id, "@confio") ||
            hasPackage(id, "@terra-money") ||
            hasPackage(id, "protobufjs") ||
            hasPackage(id, "long") ||
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
            return "cosmos"
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
