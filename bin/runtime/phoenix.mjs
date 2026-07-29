import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import net from "node:net";
import { delimiter, join } from "node:path";

export const PHOENIX_VERSION = "19.10.0";

function executable(directory, name) {
  return process.platform === "win32" ? join(directory, "Scripts", `${name}.exe`) : join(directory, "bin", name);
}

async function exists(path) {
  try { await access(path); return true; }
  catch { return false; }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal ?? "an unknown status"}.`));
    });
  });
}

async function findPython(configured) {
  const commands = [...new Set([configured, process.env.A2A_PYTHON, "python3", "python"].filter(Boolean))];
  for (const command of commands) {
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(command, ["--version"], { stdio: "ignore" });
        child.once("error", reject);
        child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("Unavailable")));
      });
      return command;
    } catch { /* Try the next interpreter. */ }
  }
  throw new Error("Python 3 was not found. Install Python 3.10+ or set A2A_PYTHON to an interpreter path.");
}

async function availablePort(preferred, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", preferred ? () => availablePort(0, host).then(resolve, reject) : reject);
    server.listen({ port: preferred, host }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : preferred;
      server.close(() => resolve(port));
    });
  });
}

async function availableWildcardPort(preferred) {
  try { return await availablePort(preferred, "::"); }
  catch { return availablePort(preferred, "0.0.0.0"); }
}

async function waitUntilReady(url, child, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Phoenix exited before becoming ready (code ${child.exitCode}).`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.status < 500) return;
    } catch { /* Phoenix is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Phoenix did not become ready at ${url} within ${Math.round(timeoutMs / 1000)} seconds.`);
}

export async function startManagedPhoenix({ dataDirectory, python, httpPort = 6006, grpcPort = 4317 }) {
  const runtimeDirectory = join(dataDirectory, "runtime", `phoenix-${PHOENIX_VERSION}`);
  const workingDirectory = join(dataDirectory, "telemetry", "phoenix");
  const venvPython = executable(runtimeDirectory, "python");
  const phoenix = executable(runtimeDirectory, "phoenix");
  await mkdir(workingDirectory, { recursive: true, mode: 0o700 });

  if (!(await exists(phoenix))) {
    const interpreter = await findPython(python);
    process.stdout.write(`Preparing the managed telemetry runtime (Phoenix ${PHOENIX_VERSION}); this is a one-time setup.\n`);
    await mkdir(join(dataDirectory, "runtime"), { recursive: true, mode: 0o700 });
    await run(interpreter, ["-m", "venv", runtimeDirectory]);
    await run(venvPython, ["-m", "pip", "install", "--disable-pip-version-check", `arize-phoenix==${PHOENIX_VERSION}`]);
  }

  const selectedHttpPort = await availablePort(Number(httpPort));
  // Phoenix binds its gRPC collector on a wildcard interface, so probe the
  // wildcard socket as well; checking loopback alone can miss an IPv6 bind.
  const selectedGrpcPort = await availableWildcardPort(Number(grpcPort));
  const host = "127.0.0.1";
  const baseUrl = `http://${host}:${selectedHttpPort}`;
  const environment = {
    ...process.env,
    PHOENIX_HOST: host,
    PHOENIX_PORT: String(selectedHttpPort),
    PHOENIX_GRPC_PORT: String(selectedGrpcPort),
    PHOENIX_WORKING_DIR: workingDirectory,
    PATH: `${join(runtimeDirectory, process.platform === "win32" ? "Scripts" : "bin")}${delimiter}${process.env.PATH ?? ""}`,
  };
  const child = spawn(phoenix, ["serve", "--host", host, "--port", String(selectedHttpPort)], {
    env: environment,
    stdio: "inherit",
  });
  try {
    await waitUntilReady(baseUrl, child);
  } catch (error) {
    if (child.exitCode === null) child.kill("SIGTERM");
    throw error;
  }
  return {
    child,
    environment: {
      A2A_TELEMETRY_PROVIDER: "phoenix",
      A2A_PHOENIX_MANAGED: "true",
      A2A_PHOENIX_BASE_URL: baseUrl,
      A2A_OTLP_HTTP_ENDPOINT: `${baseUrl}/v1/traces`,
      A2A_OTLP_GRPC_ENDPOINT: `http://${host}:${selectedGrpcPort}`,
    },
    baseUrl,
  };
}
