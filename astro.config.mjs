import image from "@astrojs/image";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  output: "static",
  integrations: [image()],
});
