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
exports.parseToolCalls = parseToolCalls;
exports.executeTool = executeTool;
exports.toolDescriptions = toolDescriptions;
exports.processToolCalls = processToolCalls;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const chalk_1 = __importDefault(require("chalk"));
const utils_1 = require("./utils");
const executor_1 = require("./executor");
function parseToolCalls(text) {
    const calls = [];
    const toolRegex = /<tool\s+name="(\w+)">([\s\S]*?)<\/tool>/g;
    let match;
    while ((match = toolRegex.exec(text)) !== null) {
        const tool = match[1];
        const body = match[2];
        const args = {};
        const argRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
        let argMatch;
        while ((argMatch = argRegex.exec(body)) !== null) {
            let val = argMatch[2].trim();
            val = val.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
            if (argMatch[1] === "content") {
                val = val.replace(/^```[\w]*\n/, "").replace(/\n```$/, "");
            }
            args[argMatch[1]] = val;
        }
        calls.push({ tool, args });
    }
    return calls;
}
async function executeTool(call) {
    const root = (0, utils_1.getProjectRoot)();
    switch (call.tool) {
        case "read_file": {
            const filePath = path.resolve(root, call.args.path || "");
            if (!fs.existsSync(filePath))
                return `Error: file not found — ${call.args.path}`;
            try {
                const content = fs.readFileSync(filePath, "utf-8");
                return (0, utils_1.truncate)(content, 8000);
            }
            catch (e) {
                return `Error reading file: ${e.message}`;
            }
        }
        case "write_file": {
            const filePath = path.resolve(root, call.args.path || "");
            const content = call.args.content || "";
            try {
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir))
                    fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(filePath, content, "utf-8");
                return `File written: ${call.args.path}`;
            }
            catch (e) {
                return `Error writing file: ${e.message}`;
            }
        }
        case "run_command": {
            const cmd = call.args.command || "";
            console.log(chalk_1.default.blue(`\n  [Tool] run_command: ${cmd}`));
            const result = await (0, executor_1.safeExecute)(cmd, root);
            if (result.skipped)
                return "Command skipped by user.";
            if (result.code !== 0) {
                return `Command failed (exit ${result.code}):\n${(0, utils_1.truncate)(result.stderr || result.stdout, 4000)}`;
            }
            return (0, utils_1.truncate)(result.stdout, 4000) || "(no output)";
        }
        case "list_dir": {
            const dirPath = path.resolve(root, call.args.path || ".");
            if (!fs.existsSync(dirPath))
                return `Error: directory not found — ${call.args.path}`;
            try {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                return entries
                    .map((e) => (e.isDirectory() ? e.name + "/" : e.name))
                    .join("\n");
            }
            catch (e) {
                return `Error listing directory: ${e.message}`;
            }
        }
        case "search_files": {
            const query = (call.args.query || "").toLowerCase();
            const dir = path.resolve(root, call.args.path || ".");
            const results = [];
            searchDir(dir, root, query, results, 0);
            if (results.length === 0)
                return "No matches found.";
            return results.slice(0, 30).join("\n");
        }
        default:
            return `Unknown tool: ${call.tool}`;
    }
}
function searchDir(dir, root, query, results, depth) {
    if (depth > 6 || results.length > 30)
        return;
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules")
            continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            searchDir(full, root, query, results, depth + 1);
        }
        else if (entry.isFile()) {
            try {
                const content = fs.readFileSync(full, "utf-8");
                const lines = content.split("\n");
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].toLowerCase().includes(query)) {
                        const rel = path.relative(root, full).replace(/\\/g, "/");
                        results.push(`${rel}:${i + 1}: ${lines[i].trim()}`);
                        if (results.length > 30)
                            return;
                    }
                }
            }
            catch {
            }
        }
    }
}
function toolDescriptions() {
    return `You have access to the following tools. To use a tool, output an XML block EXACTLY like the examples.

<tool name="read_file">
  <path>relative/path/to/file.ts</path>
</tool>

<tool name="write_file">
  <path>relative/path/to/file.ts</path>
  <content>
file content here
  </content>
</tool>

<tool name="run_command">
  <command>npm install chalk</command>
</tool>

<tool name="list_dir">
  <path>src</path>
</tool>

<tool name="search_files">
  <path>src</path>
  <query>handleRequest</query>
</tool>

Rules:
- You may call multiple tools in one response.
- After tool results are returned, continue your reasoning.
- For file edits, always write the COMPLETE file content.
- NEVER use triple backticks (\`\`\`) to show code meant for a file. YOU MUST use the write_file tool.
- Never fabricate tool results.`;
}
async function processToolCalls(assistantText) {
    const calls = parseToolCalls(assistantText);
    if (calls.length === 0)
        return { results: "", hadCalls: false };
    const parts = [];
    for (const call of calls) {
        const result = await executeTool(call);
        parts.push(`[${call.tool}] ${result}`);
    }
    return { results: parts.join("\n\n"), hadCalls: true };
}
//# sourceMappingURL=tools.js.map