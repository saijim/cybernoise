import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://cybernoise.de",
  output: "static",
  integrations: [
    (await import("astro-compress")).default({
      Exclude: [".*png"],
    }),
    sitemap(),
  ],
});
