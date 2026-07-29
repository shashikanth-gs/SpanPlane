import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

const tag = process.env.GITHUB_REF_NAME;
if (tag && tag !== `v${packageJson.version}`) {
  throw new Error(`Release tag ${tag} must match package version v${packageJson.version}.`);
}
