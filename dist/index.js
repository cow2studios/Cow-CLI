#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = __importDefault(require("chalk"));
const utils_1 = require("./utils");
const ollama_1 = require("./ollama");
const context_1 = require("./context");
const repl_1 = require("./repl");
// Entry point — initialize the environment and launch the REPL
async function main() {
    (0, utils_1.printBanner)();
    // Bootstrap the .cowinfo directory and .gitignore entry
    (0, utils_1.ensureCowInfoDir)();
    (0, utils_1.ensureGitignore)();
    // Ensure Ollama is running and the default model is available
    await (0, ollama_1.ensureOllama)();
    // Build initial project index
    await (0, context_1.reindex)();
    // Launch interactive REPL
    console.log(chalk_1.default.gray("Type your request, or /help for commands. Ctrl+C to cancel generation.\n"));
    await (0, repl_1.startRepl)();
}
// Graceful shutdown handler
function shutdown() {
    console.log(chalk_1.default.gray("\nShutting down..."));
    (0, ollama_1.cleanupOllama)();
    process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (err) => {
    console.error(chalk_1.default.red("Uncaught exception:"), err);
    (0, ollama_1.cleanupOllama)();
    process.exit(1);
});
main().catch((err) => {
    console.error(chalk_1.default.red("Fatal error:"), err);
    (0, ollama_1.cleanupOllama)();
    process.exit(1);
});
//# sourceMappingURL=index.js.map