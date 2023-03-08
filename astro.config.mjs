import image from "@astrojs/image";
import { defineConfig } from "astro/config";

import compress from "astro-compress";

// https://astro.build/config
export default defineConfig({
  output: "static",
  integrations: [image(), compress()]
});