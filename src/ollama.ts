import * as http from "http";
import { spawn, ChildProcess } from "child_process";
import chalk from "chalk";
import ora from "ora";

const OLLAMA_HOST = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "qwen3:8b";

let ollamaProcess: ChildProcess | null = null;

// Ping the Ollama API to check if it is reachable
function pingOllama(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`${OLLAMA_HOST}/api/tags`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(res.statusCode === 200));
    });
    req.on("error", () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Start the Ollama server as a background child process
function startOllamaServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ollama", ["serve"], {
      stdio: "ignore",
      detached: true,
      shell: true,
    });
    child.unref();
    ollamaProcess = child;
    child.on("error", (err) => reject(err));
    setTimeout(() => resolve(), 3000);
  });
}

// Pull or warm the default model so the first request isn't slow
async function warmModel(model: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ name: model });
    const url = new URL(`${OLLAMA_HOST}/api/show`);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: "POST", headers: { "Content-Type": "application/json" } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode === 200) return resolve();
          pullModel(model).then(resolve).catch(reject);
        });
      }
    );
    req.on("error", () => pullModel(model).then(resolve).catch(reject));
    req.write(body);
    req.end();
  });
}

// Pull a model from the Ollama registry
function pullModel(model: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ name: model, stream: false });
    const url = new URL(`${OLLAMA_HOST}/api/pull`);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: "POST", headers: { "Content-Type": "application/json" } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Pull failed: ${data}`));
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Ensure Ollama is running and the default model is available
export async function ensureOllama(): Promise<void> {
  const spinner = ora({ text: "Connecting to Ollama...", color: "cyan" }).start();
  let alive = await pingOllama();
  if (!alive) {
    spinner.text = "Ollama not running — starting server...";
    try {
      await startOllamaServer();
    } catch {
      spinner.fail(chalk.red("Failed to start Ollama. Is it installed? (https://ollama.com)"));
      process.exit(1);
    }
    let retries = 10;
    while (retries-- > 0) {
      alive = await pingOllama();
      if (alive) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!alive) {
      spinner.fail(chalk.red("Could not reach Ollama after starting. Aborting."));
      process.exit(1);
    }
  }
  spinner.text = `Warming model ${DEFAULT_MODEL}...`;
  try {
    await warmModel(DEFAULT_MODEL);
  } catch {
    spinner.text = `Pulling model ${DEFAULT_MODEL} (first run may take a while)...`;
    try {
      await pullModel(DEFAULT_MODEL);
    } catch (e: any) {
      spinner.fail(chalk.red(`Failed to pull model: ${e.message}`));
      process.exit(1);
    }
  }
  spinner.succeed(chalk.green(`Ollama ready — model ${DEFAULT_MODEL} loaded`));
}

// Chat message type matching Ollama /api/chat schema
export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Stream a chat completion from Ollama, calling onToken for each chunk
export async function streamChat(
  messages: OllamaMessage[],
  onToken: (token: string) => void,
  signal?: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: DEFAULT_MODEL,
      messages,
      stream: true,
      options: {
        num_ctx: 4096,
        temperature: 0.3,
      },
    });
    const url = new URL(`${OLLAMA_HOST}/api/chat`);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        let full = "";
        let buffer = "";
        res.on("data", (chunk: Buffer) => {
          if (signal?.aborted) {
            res.destroy();
            return resolve(full);
          }
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              if (json.message?.content) {
                full += json.message.content;
                onToken(json.message.content);
              }
            } catch {
              // ignore malformed JSON lines
            }
          }
        });
        res.on("end", () => resolve(full));
        res.on("error", reject);
      }
    );
    if (signal) {
      signal.addEventListener("abort", () => {
        req.destroy();
        resolve("");
      }, { once: true });
    }
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Cleanup the Ollama process if we spawned it
export function cleanupOllama(): void {
  if (ollamaProcess && !ollamaProcess.killed) {
    try {
      ollamaProcess.kill();
    } catch {
      // ignore
    }
  }
}
