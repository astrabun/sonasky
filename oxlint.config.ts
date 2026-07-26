import { defineConfig } from "oxlint";

export default defineConfig({
  options: {
    typeAware: true,
  },
  ignorePatterns: ["node_modules/"],
});
