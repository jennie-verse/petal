import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("runtime version, backup version, and package version stay aligned", async () => {
  const [serviceWorker, backup, pkg] = await Promise.all([
    read("service-worker.js"),
    read("assets/js/backup.js"),
    read("package.json").then(JSON.parse),
  ]);
  const swVersion = serviceWorker.match(/petal-reader-v(\d+\.\d+\.\d+)/)?.[1];
  const backupVersion = backup.match(/APP_VERSION = "(\d+\.\d+\.\d+)"/)?.[1];
  assert.equal(swVersion, pkg.version);
  assert.equal(backupVersion, pkg.version);
});

test("GitHub Pages owner is derived from the deployment hostname", async () => {
  const journal = await read("assets/js/journal.js");
  assert.match(journal, /\.github\.io/);
  assert.match(journal, /location\?\.hostname/);
  assert.doesNotMatch(journal, /owner:\s*["']jennie-verse["']/);
});

test("service worker shell files exist and cache cleanup is Petal-scoped", async () => {
  const serviceWorker = await read("service-worker.js");
  const shellBlock = serviceWorker.slice(
    serviceWorker.indexOf("const SHELL"),
    serviceWorker.indexOf("// Font files"),
  );
  const localAssets = [...shellBlock.matchAll(/["']\.\/([^"']+)["']/g)]
    .map(match => match[1])
    .filter(path => path && path !== "");
  await Promise.all(localAssets.map(path => access(new URL(path, root))));
  assert.match(serviceWorker, /key\.startsWith\("petal-reader-"\)/);
  assert.match(serviceWorker, /url\.pathname\.includes\("\/dictionary\/"\)/);
  assert.doesNotMatch(shellBlock, /tests\//);
});

test("deployment workflow publishes an explicit runtime allowlist", async () => {
  const workflow = await read(".github/workflows/deploy.yml");
  for (const required of [
    "npm test",
    "npm run test:syntax",
    "cp .nojekyll README.md index.html manifest.webmanifest service-worker.js public/",
    "cp -R assets dictionary docs licenses vendor public/",
    "actions/upload-pages-artifact@v5",
    "actions/deploy-pages@v5",
  ]) assert.ok(workflow.includes(required), `missing workflow contract: ${required}`);
  assert.doesNotMatch(workflow, /cp -R \. public/);
});
