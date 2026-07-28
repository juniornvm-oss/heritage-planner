/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Assets importados como URL (Vite): servidos pelo próprio app, sem CDN.
declare module "*?url" {
  const src: string;
  export default src;
}
