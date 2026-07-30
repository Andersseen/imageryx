import analog from "@analogjs/platform";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: ["es2022"],
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 5173,
  },
  plugins: [
    analog({
      ssr: false,
      prerender: {
        routes: [],
      },
    }),
    tailwindcss(),
  ],
});
