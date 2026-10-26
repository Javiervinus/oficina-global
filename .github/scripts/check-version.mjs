// Pull request check: if the pull request changes what goes into the npm package,
// package.json has to carry a new version, so that merging it publishes that version.
// Changes only to docs, tests or CI don't need one (and merging them publishes nothing).
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

const { BASE_SHA, HEAD_SHA, GITHUB_STEP_SUMMARY } = process.env;
const summary = (text) => GITHUB_STEP_SUMMARY && appendFileSync(GITHUB_STEP_SUMMARY, `${text}\n`);

const changed = execFileSync("git", ["diff", "--name-only", `${BASE_SHA}...${HEAD_SHA}`], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const noRelease = (path) =>
  path.startsWith(".github/") || path.startsWith("tests/") || path.endsWith(".md") || ["LICENSE", ".gitignore"].includes(path);
const needsRelease = changed.filter((path) => !noRelease(path));

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const res = await fetch(`https://registry.npmjs.org/${pkg.name}`);
const meta = res.ok ? await res.json() : { versions: {}, "dist-tags": {} };
const published = Object.keys(meta.versions || {});
const latest = meta["dist-tags"]?.latest;

const core = (v) => v.split("-")[0].split(".").map(Number);
const newer = (a, b) => {
  const [x, y] = [core(a), core(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

if (!needsRelease.length) {
  const msg = "Only docs, tests or CI changed: merging publishes nothing. / Solo cambian textos, pruebas o CI: al fusionar no se publica nada.";
  console.log(msg);
  summary(msg);
} else if (published.includes(pkg.version) || (latest && !newer(pkg.version, latest) && !pkg.version.includes("-"))) {
  console.error(
    `This pull request changes the package (${needsRelease.slice(0, 5).join(", ")}${needsRelease.length > 5 ? ", …" : ""}) ` +
      `but ${pkg.name}@${pkg.version} is already on npm (latest: ${latest}).\n` +
      `Bump the version: npm version patch --no-git-tag-version (or minor for new features).\n` +
      `Sube la versión: npm version patch --no-git-tag-version (o minor si agrega algo nuevo).`,
  );
  summary(`**Bump the version / Sube la versión:** ${pkg.version} is already on npm (latest: ${latest}).`);
  process.exit(1);
} else {
  const msg = `Merging publishes ${pkg.name}@${pkg.version} to npm (latest now: ${latest ?? "none"}). / Al fusionar se publica la ${pkg.version} en npm.`;
  console.log(msg);
  summary(msg);
}
