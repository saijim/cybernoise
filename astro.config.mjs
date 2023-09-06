import sitemap from "@astrojs/sitemap";
import compress from "astro-compress";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://cybernoise.de",
  output: "static",
  integrations: [compress(), sitemap()],
});
