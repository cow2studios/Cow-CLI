import chalk from "chalk";
import ora from "ora";
import { OllamaMessage, streamChat } from "./ollama";
import { reindex } from "./context";
import { buildSystemPrompt } from "./prompt";
import { processToolCalls } from "./tools";
import { loadCowAutoConfig, rl } from "./utils";
import {
  Session,
  appendMessage,
  trimMessages,
  startNewSession,
  getOrCreateLatestSession,
} from "./session";

const MAX_CONTEXT_CHARS = 14000;
const MAX_ERROR_ITERATIONS = 5;

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

  let abortController: AbortController | null = null;
  let generating = false;

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

    const { tree, exports } = await reindex();
    const systemPrompt = buildSystemPrompt(tree, exports);

    const userMsg: OllamaMessage = { role: "user", content: line };
    appendMessage(session, userMsg);

    const trimmed = trimMessages(session.messages, MAX_CONTEXT_CHARS);
    const messages: OllamaMessage[] = [
      { role: "system", content: systemPrompt },
      ...trimmed,
    ];

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

    appendMessage(session, { role: "assistant", content: fullResponse });

    const config = loadCowAutoConfig();
    let errorIterations = 0;
    let lastResponse = fullResponse;

    while (true) {
      const { results, hadCalls } = await processToolCalls(lastResponse);
      if (!hadCalls) break;

      console.log(chalk.gray("\n--- Tool Results ---"));
      console.log(chalk.white(results));
      console.log(chalk.gray("--- End Results ---\n"));

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