import { defineConfig } from "astro/config";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];
const owner = process.env.GITHUB_REPOSITORY?.split("/")[0];
const isUserSite = repository === `${owner}.github.io`;

export default defineConfig({
  output: "static",
  base: process.env.GITHUB_ACTIONS && repository && !isUserSite ? `/${repository}` : "/",
});
