import * as readline from "readline";
import chalk from "chalk";
import ora from "ora";
import { OllamaMessage, streamChat } from "./ollama";
import { reindex } from "./context";
import { buildSystemPrompt } from "./prompt";
import { processToolCalls } from "./tools";
import { loadCowAutoConfig } from "./utils";
import {
  Session,
  appendMessage,
  trimMessages,
  startNewSession,
  getOrCreateLatestSession,
} from "./session";

// Maximum context budget in characters (~4096 tokens at ~4 chars/token)
const MAX_CONTEXT_CHARS = 14000;
// Maximum consecutive error-recovery iterations before halting
const MAX_ERROR_ITERATIONS = 5;

// Start the interactive REPL loop
export async function startRepl(): Promise<void> {
  let session: Session = getOrCreateLatestSession();
  const resuming = session.messages.length > 0;
  if (resuming) {
    console.log(
      chalk.gray(
        `Resuming session ${session.id} (${session.messages.length} messages). Type /new for a fresh session.\n`
      )
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green("cow> "),
  });

  let abortController: AbortController | null = null;
  let generating = false;

  // Handle Ctrl+C: cancel generation or show exit hint
  rl.on("SIGINT", () => {
    if (generating && abortController) {
      abortController.abort();
      generating = false;
      console.log(chalk.yellow("\n  Generation cancelled."));
      rl.prompt();
    } else {
      console.log(chalk.gray("\n  (Press Ctrl+C again or type /exit to quit)"));
      rl.prompt();
    }
  });

  rl.prompt();

  rl.on("line", async (input: string) => {
    const line = input.trim();
    if (!line) {
      rl.prompt();
      return;
    }

    // Handle meta-commands
    if (line === "/exit" || line === "/quit") {
      console.log(chalk.gray("Goodbye!"));
      rl.close();
      process.exit(0);
    }
    if (line === "/new") {
      session = startNewSession();
      console.log(chalk.green("Started new session: ") + chalk.white(session.id));
      rl.prompt();
      return;
    }
    if (line === "/history") {
      for (const msg of session.messages) {
        const tag = msg.role === "user" ? chalk.green("you") : chalk.cyan("cow");
        console.log(`${tag}: ${msg.content.slice(0, 120)}...`);
      }
      rl.prompt();
      return;
    }
    if (line === "/reindex") {
      await reindex();
      rl.prompt();
      return;
    }
    if (line === "/clear") {
      process.stdout.write(process.platform === "win32" ? "\x1B[2J\x1B[0f" : "\x1B[2J\x1B[3J\x1B[H");
      rl.prompt();
      return;
    }
    if (line === "/help") {
      console.log(chalk.cyan("Commands:"));
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
    const { tree, exports } = await reindex();
    const systemPrompt = buildSystemPrompt(tree, exports);

    // Add user message
    const userMsg: OllamaMessage = { role: "user", content: line };
    appendMessage(session, userMsg);

    // Build messages array with system prompt and trimmed history
    const trimmed = trimMessages(session.messages, MAX_CONTEXT_CHARS);
    const messages: OllamaMessage[] = [
      { role: "system", content: systemPrompt },
      ...trimmed,
    ];

    // Stream the response
    generating = true;
    abortController = new AbortController();
    process.stdout.write(chalk.cyan("\ncow: "));

    let fullResponse = "";
    try {
      fullResponse = await streamChat(
        messages,
        (token) => process.stdout.write(token),
        abortController.signal
      );
    } catch (err: any) {
      console.log(chalk.red(`\n  Error: ${err.message}`));
      generating = false;
      rl.prompt();
      return;
    }
    generating = false;
    console.log("");

    // Save assistant message
    appendMessage(session, { role: "assistant", content: fullResponse });

    // Process tool calls in the response with autonomous error recovery
    const config = loadCowAutoConfig();
    let errorIterations = 0;
    let lastResponse = fullResponse;

    while (true) {
      const { results, hadCalls } = await processToolCalls(lastResponse);
      if (!hadCalls) break;

      console.log(chalk.gray("\n--- Tool Results ---"));
      console.log(chalk.white(results));
      console.log(chalk.gray("--- End Results ---\n"));

      // Check for errors in tool results
      const hasError =
        results.includes("Command failed") || results.includes("Error:");
      if (hasError && config.autoErrorRecovery) {
        errorIterations++;
        if (errorIterations >= MAX_ERROR_ITERATIONS) {
          console.log(
            chalk.red.bold(
              `\n${"=".repeat(60)}\n  HALTED: ${MAX_ERROR_ITERATIONS} consecutive error-recovery attempts failed.\n  Please review the errors above and provide instructions.\n${"=".repeat(60)}\n`
            )
          );
          break;
        }
      } else {
        errorIterations = 0;
      }

      // Feed tool results back to the LLM for continuation
      const toolMsg: OllamaMessage = { role: "user", content: `Tool results:\n${results}` };
      appendMessage(session, toolMsg);
      const continueMessages: OllamaMessage[] = [
        { role: "system", content: systemPrompt },
        ...trimMessages(session.messages, MAX_CONTEXT_CHARS),
      ];

      generating = true;
      abortController = new AbortController();
      process.stdout.write(chalk.cyan("cow: "));
      try {
        lastResponse = await streamChat(
          continueMessages,
          (token) => process.stdout.write(token),
          abortController.signal
        );
      } catch {
        break;
      }
      generating = false;
      console.log("");
      appendMessage(session, { role: "assistant", content: lastResponse });
    }

    rl.prompt();
  });

  rl.on("close", () => {
    process.exit(0);
  });
}
