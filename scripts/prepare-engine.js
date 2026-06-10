#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(__dirname);
const VENDOR_DIR = path.join(ROOT_DIR, "vendor");
const ENGINE_DIR = path.join(VENDOR_DIR, "search-console-mcp");
const PACKAGE_DIR = path.join(VENDOR_DIR, "package");
const PACKAGE_NAME = "search-console-mcp@1.14.0";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT_DIR,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `${command} ${args.join(" ")} failed`);
  }
  return result.stdout || "";
}

function patchSetupMenu() {
  const setupFile = path.join(ENGINE_DIR, "dist", "setup.js");
  if (!existsSync(setupFile)) {
    throw new Error(`Cannot find ${setupFile}`);
  }

  let source = readFileSync(setupFile, "utf8");
  const hadGA4Flag = source.includes("engineFlag === 'ga4'");
  const hadGA4Menu = source.includes("console.log('2. Google Analytics 4')");

  if (!hadGA4Flag) {
    source = source.replace(
      /else if \(engineFlag === 'google'\) \{\n\s+await handleGoogleFlow\(configStatus\);\n\s+return;\n\s+\}/,
      `else if (engineFlag === 'google') {
        await handleGoogleFlow(configStatus);
        return;
    }
    else if (engineFlag === 'ga4') {
        await handleGA4Flow(configStatus);
        return;
    }`
    );
  }

  if (!hadGA4Menu) {
    source = source.replace(
      "console.log(`\\n1. Google Search Console`);\n        console.log('2. Bing Webmaster Tools');\n        console.log('3. Exit');\n        const choice = await ask(`\\n${colors.bold}${colors.cyan}Enter your choice (1-3): ${colors.reset}`);",
      "console.log(`\\n1. Google Search Console`);\n        console.log('2. Google Analytics 4');\n        console.log('3. Bing Webmaster Tools');\n        console.log('4. Exit');\n        const choice = await ask(`\\n${colors.bold}${colors.cyan}Enter your choice (1-4): ${colors.reset}`);"
    );

    source = source.replace(
      "case '2':\n                await handleBingFlow(configStatus);\n                break;\n            case '3':\n            default:",
      "case '2':\n                await handleGA4Flow(configStatus);\n                break;\n            case '3':\n                await handleBingFlow(configStatus);\n                break;\n            case '4':\n            default:"
    );
  }

  if (!source.includes("handleGA4Flow")) {
    throw new Error("The installed search-console-mcp package does not include GA4 setup support.");
  }
  if (!source.includes("engineFlag === 'ga4'") || !source.includes("console.log('2. Google Analytics 4')")) {
    throw new Error("Failed to patch the GA4 setup entry point.");
  }

  writeFileSync(setupFile, source);
}

mkdirSync(VENDOR_DIR, { recursive: true });
rmSync(ENGINE_DIR, { recursive: true, force: true });
rmSync(PACKAGE_DIR, { recursive: true, force: true });

const tarballName = run("npm", ["pack", PACKAGE_NAME, "--silent"], { cwd: VENDOR_DIR, capture: true }).trim().split(/\r?\n/).pop();
if (!tarballName) {
  throw new Error("npm pack did not return a tarball name.");
}

run("tar", ["-xzf", tarballName], { cwd: VENDOR_DIR });
rmSync(path.join(VENDOR_DIR, tarballName), { force: true });
renameSync(PACKAGE_DIR, ENGINE_DIR);
run("npm", ["install", "--no-audit", "--no-fund", "--omit=dev"], { cwd: ENGINE_DIR });
patchSetupMenu();

console.log(`Prepared ${PACKAGE_NAME} in ${ENGINE_DIR}`);
