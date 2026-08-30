import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const dryRun = process.argv.includes("--dry-run");

const TAURI_CONF_PATH = "src-tauri/tauri.conf.json";
const PACKAGE_JSON_PATH = "package.json";
const CARGO_TOML_PATH = "src-tauri/Cargo.toml";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function writeCargoVersion(path, newVersion) {
  const lines = readFileSync(path, "utf8").split("\n");
  const packageStart = lines.findIndex((l) => l.trim() === "[package]");
  if (packageStart === -1) {
    throw new Error(`Couldn't find [package] section in ${path}`);
  }
  let packageEnd = lines.findIndex(
    (l, i) => i > packageStart && /^\[/.test(l.trim())
  );
  if (packageEnd === -1) packageEnd = lines.length;

  const versionLine = lines.findIndex(
    (l, i) => i > packageStart && i < packageEnd && /^version\s*=\s*".*"$/.test(l.trim())
  );
  if (versionLine === -1) {
    throw new Error(`Couldn't find a version line in [package] section of ${path}`);
  }
  lines[versionLine] = `version = "${newVersion}"`;
  writeFileSync(path, lines.join("\n"));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (git(["status", "--porcelain"]).trim() !== "") {
  fail("Working tree has uncommitted changes - commit or stash them first.");
}

const tags = git(["tag", "--list", "v*", "--sort=-v:refname"])
  .trim()
  .split("\n")
  .filter(Boolean);
const previousTag = tags[0] ?? null;

const currentVersion = readJson(TAURI_CONF_PATH).version;

if (!previousTag) {
  console.log(
    `No previous release tag found - files are already at v${currentVersion}, which would be the first release. Nothing to bump.`
  );
  process.exit(0);
}

const versionMatch = previousTag.match(/^v(\d+)\.(\d+)\.(\d+)$/);
if (!versionMatch) {
  fail(`Latest tag "${previousTag}" isn't a plain vMAJOR.MINOR.PATCH tag - can't compute a bump from it.`);
}

const log = git(["log", `${previousTag}..HEAD`, "--pretty=format:%H%x00%B%x01"]);
const commits = log
  .split("\x01")
  .map((chunk) => chunk.trim())
  .filter(Boolean)
  .map((chunk) => {
    const sep = chunk.indexOf("\x00");
    const hash = chunk.slice(0, sep);
    const message = chunk.slice(sep + 1).trim();
    return { hash, message, subject: message.split("\n")[0] };
  });

if (commits.length === 0) {
  console.log(`No commits since ${previousTag} - nothing to release.`);
  process.exit(0);
}

const SUBJECT_RE = /^([a-zA-Z]+)(\([^)]*\))?(!)?:\s*(.+)$/;
const BREAKING_FOOTER_RE = /^BREAKING[ -]CHANGE:/m;

const included = { major: [], minor: [], patch: [] };
let bump = null;

for (const commit of commits) {
  const m = commit.subject.match(SUBJECT_RE);
  if (!m) continue;
  const [, type, , breakingBang] = m;
  const isBreaking = Boolean(breakingBang) || BREAKING_FOOTER_RE.test(commit.message);

  let level;
  if (isBreaking) level = "major";
  else if (type === "feat") level = "minor";
  else if (type === "fix") level = "patch";
  else continue;

  included[level].push(commit);
  if (level === "major") bump = "major";
  else if (level === "minor" && bump !== "major") bump = "minor";
  else if (level === "patch" && !bump) bump = "patch";
}

if (!bump) {
  console.log(
    `No feat/fix/breaking commits since ${previousTag} (${commits.length} commit(s) found, none release-worthy) - nothing to release.`
  );
  process.exit(0);
}

let [, major, minor, patch] = versionMatch.map(Number);
if (bump === "major") {
  major += 1;
  minor = 0;
  patch = 0;
} else if (bump === "minor") {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}
const newVersion = `${major}.${minor}.${patch}`;

console.log(`Previous release: ${previousTag}`);
console.log(`Bump: ${bump} -> v${newVersion}\n`);
for (const level of ["major", "minor", "patch"]) {
  for (const c of included[level]) {
    console.log(`  [${level}] ${c.subject} (${c.hash.slice(0, 7)})`);
  }
}

if (dryRun) {
  console.log("\n(dry run - no files changed)");
  process.exit(0);
}

const tauriConf = readJson(TAURI_CONF_PATH);
tauriConf.version = newVersion;
writeJson(TAURI_CONF_PATH, tauriConf);

const pkg = readJson(PACKAGE_JSON_PATH);
pkg.version = newVersion;
writeJson(PACKAGE_JSON_PATH, pkg);

writeCargoVersion(CARGO_TOML_PATH, newVersion);

console.log(`\nUpdated ${PACKAGE_JSON_PATH}, ${TAURI_CONF_PATH}, and ${CARGO_TOML_PATH} to v${newVersion}.`);
console.log("\nReview the diff, then:");
console.log(`  git add ${PACKAGE_JSON_PATH} ${TAURI_CONF_PATH} ${CARGO_TOML_PATH}`);
console.log(`  git commit -m "chore(release): v${newVersion}"`);
console.log(`  git tag v${newVersion}`);
console.log("  git push --follow-tags");
