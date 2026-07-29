#!/usr/bin/env node

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function usage() {
  process.stdout.write(`A2A Workbench\n\nUsage:\n  a2a-workbench [options]\n\nOptions:\n  -p, --port <port>       Port to listen on (default: 3001)\n  -H, --hostname <host>   Hostname to listen on (default: 127.0.0.1)\n      --keepAliveTimeout  Forwarded to Next.js in milliseconds\n  -h, --help              Show this help\n\nExamples:\n  npx a2a-workbench\n  a2a-workbench --port 4567\n  a2a-workbench -H 0.0.0.0\n`);
}

function optionValue(names, fallback) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    for (const name of names) {
      if (argument === name) {
        const value = args[index + 1];
        if (!value || value.startsWith("-")) throw new Error(`${name} requires a value.`);
        return value;
      }
      if (argument.startsWith(`${name}=`)) return argument.slice(name.length + 1);
    }
  }
  return fallback;
}

if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

try {
  const port = optionValue(["--port", "-p"], process.env.PORT || "3001");
  const hostname = optionValue(["--hostname", "--host", "-H"], "127.0.0.1");
  const passthrough = args.filter((argument, index) => {
    const previous = args[index - 1];
    return !["--port", "-p", "--hostname", "--host", "-H"].includes(argument) &&
      !["--port", "-p", "--hostname", "--host", "-H"].includes(previous) &&
      !argument.startsWith("--port=") && !argument.startsWith("--hostname=") && !argument.startsWith("--host=");
  });
  const nextCli = require.resolve("next/dist/bin/next", { paths: [packageRoot] });
  const child = spawn(process.execPath, [nextCli, "start", packageRoot, "--port", port, "--hostname", hostname, ...passthrough], {
    cwd: packageRoot,
    env: process.env,
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => process.exitCode = code ?? (signal ? 1 : 0));
  child.on("error", (error) => {
    process.stderr.write(`Unable to start A2A Workbench: ${error.message}\n`);
    process.exitCode = 1;
  });
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Unable to start A2A Workbench."}\n`);
  process.exitCode = 1;
}
