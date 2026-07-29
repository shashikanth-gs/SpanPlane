#!/usr/bin/env node

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { startManagedPhoenix } from "./runtime/phoenix.mjs";

const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function usage() {
  process.stdout.write(`A2A Workbench\n\nUsage:\n  a2a-workbench [options]\n\nOptions:\n  -p, --port <port>             Port to listen on (default: 3001)\n  -H, --hostname <host>         Hostname to listen on (default: 127.0.0.1)\n      --telemetry <mode>        auto, required, or off (default: auto)\n      --phoenix-port <port>     Phoenix UI and OTLP/HTTP port (default: 6006)\n      --phoenix-grpc-port <port> Phoenix OTLP/gRPC port (default: 4317)\n      --python <path>           Python interpreter for managed Phoenix\n      --keepAliveTimeout        Forwarded to Next.js in milliseconds\n  -h, --help                    Show this help\n\nExamples:\n  npx a2a-workbench\n  a2a-workbench --port 4567\n  a2a-workbench --telemetry off\n`);
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

async function main() {
  const port = optionValue(["--port", "-p"], process.env.PORT || "3001");
  const hostname = optionValue(["--hostname", "--host", "-H"], "127.0.0.1");
  const telemetryMode = optionValue(["--telemetry"], process.env.A2A_TELEMETRY_MODE || "auto").toLowerCase();
  if (!["auto", "required", "off"].includes(telemetryMode)) throw new Error("--telemetry must be auto, required, or off.");
  const phoenixPort = optionValue(["--phoenix-port"], process.env.A2A_PHOENIX_PORT || "6006");
  const phoenixGrpcPort = optionValue(["--phoenix-grpc-port"], process.env.A2A_PHOENIX_GRPC_PORT || "4317");
  const python = optionValue(["--python"], process.env.A2A_PYTHON);
  const localDataDirectory = resolve(process.env.A2A_DATA_DIR || resolve(process.cwd(), ".a2a-data"));
  const valueOptions = ["--port", "-p", "--hostname", "--host", "-H", "--telemetry", "--phoenix-port", "--phoenix-grpc-port", "--python"];
  const passthrough = args.filter((argument, index) => {
    const previous = args[index - 1];
    return !valueOptions.includes(argument) && !valueOptions.includes(previous) &&
      !valueOptions.some((name) => argument.startsWith(`${name}=`));
  });

  const managedChildren = [];
  let runtimeEnvironment = {
    ...process.env,
    A2A_DATA_DIR: localDataDirectory,
    A2A_TELEMETRY_PROVIDER: "none",
    A2A_TELEMETRY_STATUS: "disabled",
  };
  const externalPhoenix = process.env.A2A_PHOENIX_BASE_URL;
  if (telemetryMode !== "off" && externalPhoenix) {
    runtimeEnvironment = {
      ...runtimeEnvironment,
      A2A_TELEMETRY_PROVIDER: "phoenix",
      A2A_TELEMETRY_STATUS: "external",
      A2A_PHOENIX_MANAGED: "false",
      A2A_PHOENIX_BASE_URL: externalPhoenix,
      A2A_OTLP_HTTP_ENDPOINT: process.env.A2A_OTLP_HTTP_ENDPOINT || `${externalPhoenix.replace(/\/$/, "")}/v1/traces`,
      A2A_OTLP_GRPC_ENDPOINT: process.env.A2A_OTLP_GRPC_ENDPOINT || "",
    };
  } else if (telemetryMode !== "off") {
    try {
      const phoenix = await startManagedPhoenix({
        dataDirectory: localDataDirectory,
        python,
        httpPort: Number(phoenixPort),
        grpcPort: Number(phoenixGrpcPort),
      });
      managedChildren.push(phoenix.child);
      runtimeEnvironment = { ...runtimeEnvironment, ...phoenix.environment };
      process.stdout.write(`Telemetry ready: ${phoenix.baseUrl}\n`);
    } catch (error) {
      if (telemetryMode === "required") throw error;
      runtimeEnvironment.A2A_TELEMETRY_STATUS = "unavailable";
      process.stderr.write(`Telemetry is unavailable; continuing with A2A and sideband evidence. ${error instanceof Error ? error.message : "Phoenix failed to start."}\n`);
    }
  }

  const nextCli = require.resolve("next/dist/bin/next", { paths: [packageRoot] });
  const child = spawn(process.execPath, [nextCli, "start", packageRoot, "--port", port, "--hostname", hostname, ...passthrough], {
    cwd: packageRoot,
    env: runtimeEnvironment,
    stdio: "inherit",
  });
  managedChildren.push(child);
  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    for (const managedChild of [...managedChildren].reverse()) if (managedChild.exitCode === null) managedChild.kill(signal);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
    stop("SIGTERM");
  });
  child.on("error", (error) => {
    process.stderr.write(`Unable to start A2A Workbench: ${error.message}\n`);
    process.exitCode = 1;
    stop("SIGTERM");
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Unable to start A2A Workbench."}\n`);
  process.exitCode = 1;
});
