import * as fs from "fs";
import * as readline from "readline";
import { spawn } from "child_process";
import micromatch from "micromatch";
import chalk from "chalk";
import { loadCowAutoConfig, isDestructiveCommand, truncate } from "./utils";

// Execute a shell command and return its combined output
export function runCommand(
  cmd: string,
  cwd: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    const shell = isWindows ? "cmd" : "/bin/sh";
    const flag = isWindows ? "/c" : "-c";
    const child = spawn(shell, [flag, cmd], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("close", (code) =>
      resolve({ code: code ?? 1, stdout, stderr })
    );
    child.on("error", (err) =>
      resolve({ code: 1, stdout: "", stderr: err.message })
    );
  });
}

// Prompt the user for Y/N confirmation in the terminal
function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith("y"));
    });
  });
}

// Determine if a command is auto-approved based on .cowauto patterns
function isAutoApproved(cmd: string, patterns: string[]): boolean {
  return patterns.some((pattern) => micromatch.isMatch(cmd, pattern));
}

// Execute a command with safety checks and optional user confirmation
export async function safeExecute(
  cmd: string,
  cwd: string
): Promise<{ code: number; stdout: string; stderr: string; skipped: boolean }> {
  const config = loadCowAutoConfig();
  if (isDestructiveCommand(cmd)) {
    console.log(chalk.red.bold("\n⚠  Destructive command detected: ") + chalk.white(cmd));
    const ok = await askConfirmation(chalk.yellow("  Execute? (y/N): "));
    if (!ok) {
      console.log(chalk.gray("  Skipped."));
      return { code: 0, stdout: "", stderr: "", skipped: true };
    }
  } else if (!isAutoApproved(cmd, config.patterns)) {
    console.log(chalk.cyan("\n  Command: ") + chalk.white(cmd));
    const ok = await askConfirmation(chalk.yellow("  Execute? (y/N): "));
    if (!ok) {
      console.log(chalk.gray("  Skipped."));
      return { code: 0, stdout: "", stderr: "", skipped: true };
    }
  } else {
    console.log(chalk.gray(`  Auto-executing: ${cmd}`));
  }
  const result = await runCommand(cmd, cwd);
  if (result.stdout.trim()) {
    console.log(chalk.white(truncate(result.stdout.trim(), 2000)));
  }
  if (result.stderr.trim() && result.code !== 0) {
    console.log(chalk.red(truncate(result.stderr.trim(), 2000)));
  }
  return { ...result, skipped: false };
}
