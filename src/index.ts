#!/usr/bin/env node
import chalk from "chalk";
import { ensureCowInfoDir, ensureGitignore, printBanner } from "./utils";
import { ensureOllama, cleanupOllama } from "./ollama";
import { reindex } from "./context";
import { startRepl } from "./repl";

// Entry point — initialize the environment and launch the REPL
async function main(): Promise<void> {
  printBanner();

  // Bootstrap the .cowinfo directory and .gitignore entry
  ensureCowInfoDir();
  ensureGitignore();

  // Ensure Ollama is running and the default model is available
  await ensureOllama();

  // Build initial project index
  await reindex();

  // Launch interactive REPL
  console.log(
    chalk.gray("Type your request, or /help for commands. Ctrl+C to cancel generation.\n")
  );
  await startRepl();
}

// Graceful shutdown handler
function shutdown(): void {
  console.log(chalk.gray("\nShutting down..."));
  cleanupOllama();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("uncaughtException", (err) => {
  console.error(chalk.red("Uncaught exception:"), err);
  cleanupOllama();
  process.exit(1);
});

main().catch((err) => {
  console.error(chalk.red("Fatal error:"), err);
  cleanupOllama();
  process.exit(1);
});
