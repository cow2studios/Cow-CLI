"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRepl = startRepl;
const chalk_1 = __importDefault(require("chalk"));
const ollama_1 = require("./ollama");
const context_1 = require("./context");
const prompt_1 = require("./prompt");
const tools_1 = require("./tools");
const utils_1 = require("./utils");
const session_1 = require("./session");
const MAX_CONTEXT_CHARS = 14000;
const MAX_ERROR_ITERATIONS = 5;
async function startRepl() {
    let session = (0, session_1.getOrCreateLatestSession)();
    const resuming = session.messages.length > 0;
    if (resuming) {
        console.log(chalk_1.default.gray(`Resuming session ${session.id} (${session.messages.length} messages). Type /new for a fresh session.\n`));
    }
    let abortController = null;
    let generating = false;
    utils_1.rl.on("SIGINT", () => {
        if (generating && abortController) {
            abortController.abort();
            generating = false;
            console.log(chalk_1.default.yellow("\n  Generation cancelled."));
            utils_1.rl.prompt();
        }
        else {
            console.log(chalk_1.default.gray("\n  (Press Ctrl+C again or type /exit to quit)"));
            utils_1.rl.prompt();
        }
    });
    utils_1.rl.prompt();
    utils_1.rl.on("line", async (input) => {
        const line = input.trim();
        if (!line) {
            utils_1.rl.prompt();
            return;
        }
        if (line === "/exit" || line === "/quit") {
            console.log(chalk_1.default.gray("Goodbye!"));
            utils_1.rl.close();
            process.exit(0);
        }
        if (line === "/new") {
            session = (0, session_1.startNewSession)();
            console.log(chalk_1.default.green("Started new session: ") + chalk_1.default.white(session.id));
            utils_1.rl.prompt();
            return;
        }
        if (line === "/history") {
            for (const msg of session.messages) {
                const tag = msg.role === "user" ? chalk_1.default.green("you") : chalk_1.default.cyan("cow");
                console.log(`${tag}: ${msg.content.slice(0, 120)}...`);
            }
            utils_1.rl.prompt();
            return;
        }
        if (line === "/reindex") {
            await (0, context_1.reindex)();
            utils_1.rl.prompt();
            return;
        }
        if (line === "/clear") {
            process.stdout.write(process.platform === "win32" ? "\x1B[2J\x1B[0f" : "\x1B[2J\x1B[3J\x1B[H");
            utils_1.rl.prompt();
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
            utils_1.rl.prompt();
            return;
        }
        const { tree, exports } = await (0, context_1.reindex)();
        const systemPrompt = (0, prompt_1.buildSystemPrompt)(tree, exports);
        const userMsg = { role: "user", content: line };
        (0, session_1.appendMessage)(session, userMsg);
        const trimmed = (0, session_1.trimMessages)(session.messages, MAX_CONTEXT_CHARS);
        const messages = [
            { role: "system", content: systemPrompt },
            ...trimmed,
        ];
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
            utils_1.rl.prompt();
            return;
        }
        generating = false;
        console.log("");
        (0, session_1.appendMessage)(session, { role: "assistant", content: fullResponse });
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
        utils_1.rl.prompt();
    });
    utils_1.rl.on("close", () => {
        process.exit(0);
    });
}
//# sourceMappingURL=repl.js.map