"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRepl = startRepl;
const readline = __importStar(require("readline"));
const chalk_1 = __importDefault(require("chalk"));
const ollama_1 = require("./ollama");
const context_1 = require("./context");
const prompt_1 = require("./prompt");
const tools_1 = require("./tools");
const utils_1 = require("./utils");
const session_1 = require("./session");
// Maximum context budget in characters (~4096 tokens at ~4 chars/token)
const MAX_CONTEXT_CHARS = 14000;
// Maximum consecutive error-recovery iterations before halting
const MAX_ERROR_ITERATIONS = 5;
// Start the interactive REPL loop
async function startRepl() {
    let session = (0, session_1.getOrCreateLatestSession)();
    const resuming = session.messages.length > 0;
    if (resuming) {
        console.log(chalk_1.default.gray(`Resuming session ${session.id} (${session.messages.length} messages). Type /new for a fresh session.\n`));
    }
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk_1.default.green("cow> "),
    });
    let abortController = null;
    let generating = false;
    // Handle Ctrl+C: cancel generation or show exit hint
    rl.on("SIGINT", () => {
        if (generating && abortController) {
            abortController.abort();
            generating = false;
            console.log(chalk_1.default.yellow("\n  Generation cancelled."));
            rl.prompt();
        }
        else {
            console.log(chalk_1.default.gray("\n  (Press Ctrl+C again or type /exit to quit)"));
            rl.prompt();
        }
    });
    rl.prompt();
    rl.on("line", async (input) => {
        const line = input.trim();
        if (!line) {
            rl.prompt();
            return;
        }
        // Handle meta-commands
        if (line === "/exit" || line === "/quit") {
            console.log(chalk_1.default.gray("Goodbye!"));
            rl.close();
            process.exit(0);
        }
        if (line === "/new") {
            session = (0, session_1.startNewSession)();
            console.log(chalk_1.default.green("Started new session: ") + chalk_1.default.white(session.id));
            rl.prompt();
            return;
        }
        if (line === "/history") {
            for (const msg of session.messages) {
                const tag = msg.role === "user" ? chalk_1.default.green("you") : chalk_1.default.cyan("cow");
                console.log(`${tag}: ${msg.content.slice(0, 120)}...`);
            }
            rl.prompt();
            return;
        }
        if (line === "/reindex") {
            await (0, context_1.reindex)();
            rl.prompt();
            return;
        }
        if (line === "/clear") {
            process.stdout.write(process.platform === "win32" ? "\x1B[2J\x1B[0f" : "\x1B[2J\x1B[3J\x1B[H");
            rl.prompt();
            return;
        }
        if (line === "/help") {
            console.log(chalk_1.default.cyan("Commands:"));
            console.log("  /new       Start a fresh session");
            console.log("  /history   Show session history");
            console.log("  /reindex   Rebuild project index");
            console.log("  /clear     Clear the terminal screen");
            console.log("  /exit      Quit Cow CLI");
            console.log("  /help      Show this help");
            rl.prompt();
            return;
        }
        // Re-index project for fresh context
        const { tree, exports } = await (0, context_1.reindex)();
        const systemPrompt = (0, prompt_1.buildSystemPrompt)(tree, exports);
        // Add user message
        const userMsg = { role: "user", content: line };
        (0, session_1.appendMessage)(session, userMsg);
        // Build messages array with system prompt and trimmed history
        const trimmed = (0, session_1.trimMessages)(session.messages, MAX_CONTEXT_CHARS);
        const messages = [
            { role: "system", content: systemPrompt },
            ...trimmed,
        ];
        // Stream the response
        generating = true;
        abortController = new AbortController();
        process.stdout.write(chalk_1.default.cyan("\ncow: "));
        let fullResponse = "";
        try {
            fullResponse = await (0, ollama_1.streamChat)(messages, (token) => process.stdout.write(token), abortController.signal);
        }
        catch (err) {
            console.log(chalk_1.default.red(`\n  Error: ${err.message}`));
            generating = false;
            rl.prompt();
            return;
        }
        generating = false;
        console.log("");
        // Save assistant message
        (0, session_1.appendMessage)(session, { role: "assistant", content: fullResponse });
        // Process tool calls in the response with autonomous error recovery
        const config = (0, utils_1.loadCowAutoConfig)();
        let errorIterations = 0;
        let lastResponse = fullResponse;
        while (true) {
            const { results, hadCalls } = await (0, tools_1.processToolCalls)(lastResponse);
            if (!hadCalls)
                break;
            console.log(chalk_1.default.gray("\n--- Tool Results ---"));
            console.log(chalk_1.default.white(results));
            console.log(chalk_1.default.gray("--- End Results ---\n"));
            // Check for errors in tool results
            const hasError = results.includes("Command failed") || results.includes("Error:");
            if (hasError && config.autoErrorRecovery) {
                errorIterations++;
                if (errorIterations >= MAX_ERROR_ITERATIONS) {
                    console.log(chalk_1.default.red.bold(`\n${"=".repeat(60)}\n  HALTED: ${MAX_ERROR_ITERATIONS} consecutive error-recovery attempts failed.\n  Please review the errors above and provide instructions.\n${"=".repeat(60)}\n`));
                    break;
                }
            }
            else {
                errorIterations = 0;
            }
            // Feed tool results back to the LLM for continuation
            const toolMsg = { role: "user", content: `Tool results:\n${results}` };
            (0, session_1.appendMessage)(session, toolMsg);
            const continueMessages = [
                { role: "system", content: systemPrompt },
                ...(0, session_1.trimMessages)(session.messages, MAX_CONTEXT_CHARS),
            ];
            generating = true;
            abortController = new AbortController();
            process.stdout.write(chalk_1.default.cyan("cow: "));
            try {
                lastResponse = await (0, ollama_1.streamChat)(continueMessages, (token) => process.stdout.write(token), abortController.signal);
            }
            catch {
                break;
            }
            generating = false;
            console.log("");
            (0, session_1.appendMessage)(session, { role: "assistant", content: lastResponse });
        }
        rl.prompt();
    });
    rl.on("close", () => {
        process.exit(0);
    });
}
//# sourceMappingURL=repl.js.map