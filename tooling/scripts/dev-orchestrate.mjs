#!/usr/bin/env node
/**
 * Sequential-ish local dev orchestrator.
 *
 * `wrangler dev` for multiple Workers that all share the same local D1
 * SQLite file (`--persist-to ../../.wrangler-state`) can fail with
 * `SQLITE_BUSY_RECOVERY` when several Workers start at exactly the same
 * time. Turbo has no built-in stagger for persistent tasks, so this script
 * starts the Workers one by one, waits until each is "Ready", and only then
 * starts the dashboard and web apps.
 *
 * On Ctrl-C the script kills every spawned child process group so stale
 * `workerd` processes don't keep ports or DB locks alive.
 */
import { spawn } from "node:child_process";

const COLORS = [
  "\x1b[36m", // cyan
  "\x1b[33m", // yellow
  "\x1b[35m", // magenta
  "\x1b[32m", // green
  "\x1b[34m", // blue
];
const RESET = "\x1b[0m";

const children = [];

function colorFor(index) {
  return COLORS[index % COLORS.length];
}

function prefixLines(data, prefix, color) {
  return data
    .toString()
    .split("\n")
    .map((line) => (line ? `${color}${prefix}${RESET} ${line}` : ""))
    .join("\n");
}

function runCommand({ name, command, args, waitForReady, color }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      detached: true,
    });

    children.push(child);

    const prefix = `[${name}]`;
    let readyResolved = false;

    child.stdout.on("data", (data) => {
      const text = data.toString();
      process.stdout.write(prefixLines(text, prefix, color));
      if (
        waitForReady &&
        !readyResolved &&
        /Ready on http:\/\/localhost:\d+/.test(text)
      ) {
        readyResolved = true;
        resolve(child);
      }
    });

    child.stderr.on("data", (data) => {
      process.stderr.write(prefixLines(data, prefix, color));
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (!waitForReady) {
        // Long-running tasks are expected to be killed by us.
        if (code !== null && code !== 0 && code !== 143 && code !== 130) {
          reject(new Error(`${name} exited with code ${code}`));
        } else {
          resolve(child);
        }
      } else if (!readyResolved) {
        reject(new Error(`${name} exited before becoming ready (code ${code})`));
      }
    });

    if (!waitForReady) {
      // For fire-and-forget tasks, resolve immediately.
      resolve(child);
    }
  });
}

async function killStaleWorkers() {
  try {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);

    const repoRoot = new URL("../..", import.meta.url).pathname;
    const { stdout } = await execAsync(
      `ps aux | grep -E "wrangler|workerd" | grep "${repoRoot}" | awk '{print $2}' || true`,
    );
    const pids = stdout
      .trim()
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    if (pids.length > 0) {
      console.log(`Killing ${pids.length} stale wrangler/workerd process(es)...`);
      for (const pid of pids) {
        try {
          process.kill(Number(pid), "SIGTERM");
        } catch {
          // Ignore already-dead processes.
        }
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  } catch {
    // Best-effort cleanup.
  }
}

function shutdown(signal) {
  console.log(`\n${signal} received, shutting down dev processes...`);
  for (const child of children) {
    try {
      // Negative PID kills the whole process group created with `detached: true`.
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // Ignore.
    }
  }
  setTimeout(() => {
    for (const child of children) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // Ignore.
      }
    }
    process.exit(0);
  }, 2000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function main() {
  const workersOnly = process.argv.includes("--workers-only");

  await killStaleWorkers();

  const pnpm = "corepack pnpm";

  const workers = [
    {
      name: "api",
      command: pnpm,
      args: ["--filter", "@imageryx/api-worker", "run", "dev"],
    },
    {
      name: "delivery",
      command: pnpm,
      args: ["--filter", "@imageryx/delivery-worker", "run", "dev"],
    },
    {
      name: "processing",
      command: pnpm,
      args: ["--filter", "@imageryx/processing-worker", "run", "dev"],
    },
  ];

  for (let i = 0; i < workers.length; i++) {
    const worker = workers[i];
    console.log(`Starting ${worker.name} worker...`);
    await runCommand({
      name: worker.name,
      command: worker.command,
      args: worker.args,
      waitForReady: true,
      color: colorFor(i),
    });
    console.log(`${worker.name} worker ready.`);
  }

  if (!workersOnly) {
    console.log("Starting dashboard and web apps...");
    await Promise.all([
      runCommand({
        name: "dashboard",
        command: pnpm,
        args: ["--filter", "@imageryx/dashboard", "run", "dev"],
        waitForReady: false,
        color: colorFor(3),
      }),
      runCommand({
        name: "web",
        command: pnpm,
        args: ["--filter", "@imageryx/web", "run", "dev"],
        waitForReady: false,
        color: colorFor(4),
      }),
    ]);
    console.log("All dev processes are running.");
  } else {
    console.log("All worker dev processes are running.");
  }
}

main().catch((error) => {
  console.error("Dev orchestrator failed:", error.message);
  shutdown("ERROR");
});
