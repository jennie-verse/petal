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

test("the library header has a single Settings entry point, and Journal lives inside it", async () => {
  const app = await read("assets/js/app.js");
  const headerActionsBlock = app.slice(app.indexOf('"header-actions"'), app.indexOf("</header>"));
  const iconButtonCount = headerActionsBlock.match(/data-action="/g)?.length || 0;
  assert.equal(iconButtonCount, 1, "library header should expose exactly one settings entry point (house style §9-1)");
  assert.match(app, /data-action="backup" aria-label="Settings"/);
  assert.doesNotMatch(app, /data-action="app-settings"/);
  assert.doesNotMatch(app, /openJournalSettings/);
  assert.match(app, /async function journalSectionHtml\(\)/);
  assert.match(app, /\$\{journalSection\}/);
});

test("public deployment documentation matches the current release and Actions setup", async () => {
  const [readme, guide, customization] = await Promise.all([
    read("README.md"),
    read("docs/GITHUB-PAGES-KO.md"),
    read("docs/CUSTOMIZATION-KO.md"),
  ]);
  assert.match(readme, /현재 버전은 `1\.0\.0`/);
  assert.match(guide, /Test and deploy Petal/);
  assert.match(guide, /Source는 \*\*GitHub Actions\*\*/);
  assert.doesNotMatch(`${readme}\n${guide}\n${customization}`, /현재 버전은 `1\.1\.0`|현재 버전은 `1\.4\.2`|현재 버전은 `1\.4\.4`|GitHub Actions 워크플로도 없습니다|petalreader\//);
});

test("foldable/wide-screen layout rules and matching build stamps", async () => {
  const [css, app, sw, version] = await Promise.all([
    read("assets/css/app.css"),
    read("assets/js/app.js"),
    read("service-worker.js"),
    read("assets/js/version.js"),
  ]);
  assert.match(css, /overscroll-behavior: none/);
  assert.match(css, /touch-action: manipulation/);
  assert.match(css, /@media \(min-width: 880px\)[\s\S]*\.book-list \{ display: grid; grid-template-columns: repeat\(2/);
  assert.ok(css.includes("@media (min-width: 640px) and (min-height: 560px)"));
  assert.match(css, /@media \(min-width: 900px\) and \(orientation: landscape\)/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /input, select, textarea \{ font-size: 16px; \}/);
  assert.match(app, /addEventListener\("resize"[\s\S]*requestAnimationFrame[\s\S]*setLayout/);
  const engine = await read("assets/js/reader-engine.js");
  assert.match(engine, /this\.view\.addEventListener\("click"[\s\S]*page-tap/);
  assert.match(engine, /event\.key === "PageDown"/);
  const stamp = version.match(/APP_BUILD = "([^"]+)"/)[1];
  assert.equal(stamp, "2026.11.12-foldable4");
  assert.ok(sw.includes(`const VERSION = "petal-reader-v1.0.0-${stamp}"`));
});

test("centered dialogs and landscape sheets respect the safe-area insets", async () => {
  const css = await read("assets/css/app.css");
  assert.match(css, /\.dialog-backdrop \{[^}]*padding: max\(16px, env\(safe-area-inset-top\)\) max\(16px, env\(safe-area-inset-right\)\) max\(16px, env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.dialog \{[^}]*max-height: calc\(100dvh - max\(16px, env\(safe-area-inset-top\)\) - max\(16px, env\(safe-area-inset-bottom\)\)\)/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 500px\) \{[\s\S]*?\.sheet-header \{ padding-top: calc\(10px \+ env\(safe-area-inset-top\)\); \}/);
});
