import image from "@astrojs/image";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://q314.de",
  output: "static",
  // integrations: [image(), compress(), sitemap()],
  integrations: [image(), sitemap()],
});
