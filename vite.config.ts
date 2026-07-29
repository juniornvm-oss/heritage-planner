import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["config.js"],
      workbox: {
        // Parsers de planta (pdf.js worker, wasm do DWG) são chunks grandes e
        // sob demanda — não faz sentido pré-cachear. Ficam fora do precache e
        // são buscados na 1ª importação (mesma origem do app, sem CDN).
        globIgnores: ["**/*.wasm"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: "Heritage GymBuilder",
        short_name: "Heritage",
        description: "Assessoria de implantação de academias — editor de projeto visual",
        theme_color: "#0A0A0B",
        background_color: "#0A0A0B",
        display: "standalone",
        orientation: "landscape",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
        ],
      },
    }),
  ],
});
