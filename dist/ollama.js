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
exports.ensureOllama = ensureOllama;
exports.streamChat = streamChat;
exports.cleanupOllama = cleanupOllama;
const http = __importStar(require("http"));
const child_process_1 = require("child_process");
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const OLLAMA_HOST = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "qwen2.5-coder:7b";
let ollamaProcess = null;
// Ping the Ollama API to check if it is reachable
function pingOllama() {
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
function startOllamaServer() {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)("ollama", ["serve"], {
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
async function warmModel(model) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ name: model });
        const url = new URL(`${OLLAMA_HOST}/api/show`);
        const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => {
                if (res.statusCode === 200)
                    return resolve();
                pullModel(model).then(resolve).catch(reject);
            });
        });
        req.on("error", () => pullModel(model).then(resolve).catch(reject));
        req.write(body);
        req.end();
    });
}
// Pull a model from the Ollama registry
function pullModel(model) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ name: model, stream: false });
        const url = new URL(`${OLLAMA_HOST}/api/pull`);
        const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => {
                if (res.statusCode === 200)
                    resolve();
                else
                    reject(new Error(`Pull failed: ${data}`));
            });
        });
        req.on("error", reject);
        req.write(body);
        req.end();
    });
}
// Ensure Ollama is running and the default model is available
async function ensureOllama() {
    const spinner = (0, ora_1.default)({ text: "Connecting to Ollama...", color: "cyan" }).start();
    let alive = await pingOllama();
    if (!alive) {
        spinner.text = "Ollama not running — starting server...";
        try {
            await startOllamaServer();
        }
        catch {
            spinner.fail(chalk_1.default.red("Failed to start Ollama. Is it installed? (https://ollama.com)"));
            process.exit(1);
        }
        let retries = 10;
        while (retries-- > 0) {
            alive = await pingOllama();
            if (alive)
                break;
            await new Promise((r) => setTimeout(r, 1500));
        }
        if (!alive) {
            spinner.fail(chalk_1.default.red("Could not reach Ollama after starting. Aborting."));
            process.exit(1);
        }
    }
    spinner.text = `Warming model ${DEFAULT_MODEL}...`;
    try {
        await warmModel(DEFAULT_MODEL);
    }
    catch {
        spinner.text = `Pulling model ${DEFAULT_MODEL} (first run may take a while)...`;
        try {
            await pullModel(DEFAULT_MODEL);
        }
        catch (e) {
            spinner.fail(chalk_1.default.red(`Failed to pull model: ${e.message}`));
            process.exit(1);
        }
    }
    spinner.succeed(chalk_1.default.green(`Ollama ready — model ${DEFAULT_MODEL} loaded`));
}
// Stream a chat completion from Ollama, calling onToken for each chunk
async function streamChat(messages, onToken, signal) {
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
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: "POST",
            headers: { "Content-Type": "application/json" },
        }, (res) => {
            let full = "";
            let buffer = "";
            res.on("data", (chunk) => {
                if (signal?.aborted) {
                    res.destroy();
                    return resolve(full);
                }
                buffer += chunk.toString();
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                for (const line of lines) {
                    if (!line.trim())
                        continue;
                    try {
                        const json = JSON.parse(line);
                        if (json.message?.content) {
                            full += json.message.content;
                            onToken(json.message.content);
                        }
                    }
                    catch {
                        // ignore malformed JSON lines
                    }
                }
            });
            res.on("end", () => resolve(full));
            res.on("error", reject);
        });
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
function cleanupOllama() {
    if (ollamaProcess && !ollamaProcess.killed) {
        try {
            ollamaProcess.kill();
        }
        catch {
            // ignore
        }
    }
}
//# sourceMappingURL=ollama.js.map