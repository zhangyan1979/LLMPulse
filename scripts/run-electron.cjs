/**
 * Launch Electron without inheriting ELECTRON_RUN_AS_NODE from IDE/agent
 * terminals. Some development environments set it globally, which would make
 * Electron behave like a plain Node process.
 */
const { spawn } = require("node:child_process");
const electronPath = require("electron");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const args = process.argv.slice(2);
const child = spawn(electronPath, args.length > 0 ? args : ["."], {
  env,
  stdio: "inherit",
  windowsHide: false
});

child.on("error", (error) => {
  console.error("Could not start Electron:", error.message);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 0;
});
