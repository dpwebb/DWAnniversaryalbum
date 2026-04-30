import { execFileSync } from "node:child_process";

function runGit(args, options = {}) {
  const output = execFileSync("git", args, {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });

  return typeof output === "string" ? output.trim() : "";
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

try {
  runGit(["rev-parse", "--is-inside-work-tree"]);
} catch {
  fail("current directory is not a git repository");
}

const branch = runGit(["branch", "--show-current"]);
if (!branch) {
  fail("repository is in detached HEAD state");
}

let upstream = "";
try {
  upstream = runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
} catch {
  fail(`branch '${branch}' has no upstream configured`);
}

const remote = upstream.split("/")[0];

console.log(`Branch: ${branch}`);
console.log(`Upstream: ${upstream}`);
console.log(`Fetching latest state from ${remote}...`);
runGit(["fetch", "--prune", remote], { stdio: "inherit" });

const status = runGit(["status", "--porcelain"]);
if (status) {
  console.log(status);
  fail("working tree has uncommitted changes");
}

const localHead = runGit(["rev-parse", "HEAD"]);
const upstreamHead = runGit(["rev-parse", upstream]);
const mergeBase = runGit(["merge-base", "HEAD", upstream]);

if (localHead === upstreamHead) {
  console.log(`OK: local HEAD matches ${upstream}`);
  process.exit(0);
}

if (localHead === mergeBase) {
  fail(`local branch is behind ${upstream}; pull the GitHub state before deploying`);
}

if (upstreamHead === mergeBase) {
  fail(`local branch is ahead of ${upstream}; push commits to GitHub before deploying`);
}

fail(`local branch has diverged from ${upstream}; reconcile with GitHub before deploying`);
