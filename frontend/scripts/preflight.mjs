import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function fail(message) {
  console.error(`[preflight] ${message}`);
  process.exit(1);
}

function ensureExecutable(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing required file: ${filePath}. Run npm install in frontend/.`);
  }

  if (process.platform === "win32") {
    return;
  }

  try {
    fs.accessSync(filePath, fs.constants.X_OK);
  } catch {
    fs.chmodSync(filePath, 0o755);
    console.log(`[preflight] Fixed execute permission on ${path.relative(process.cwd(), filePath)}`);
  }
}

const root = process.cwd();
const nodeModulesDir = path.join(root, "node_modules");

if (!fs.existsSync(nodeModulesDir)) {
  fail("node_modules is missing. Run npm install in frontend/ before starting dev server.");
}

ensureExecutable(path.join(root, "node_modules", ".bin", "vite"));
ensureExecutable(path.join(root, "node_modules", "vite", "bin", "vite.js"));

try {
  require("rollup/dist/native.js");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const isOptionalRollupMissing = /Cannot find module '@rollup\/rollup-/.test(message);

  if (isOptionalRollupMissing) {
    fail(
      "Missing Rollup optional dependency for this OS/CPU. This usually happens when node_modules was copied from another machine. Remove node_modules and package-lock.json, then run npm install in frontend/."
    );
  }

  fail(`Dependency check failed: ${message}`);
}
