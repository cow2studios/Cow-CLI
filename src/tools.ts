import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import { getProjectRoot, truncate } from "./utils";
import { safeExecute, runCommand } from "./executor";
import { OllamaMessage } from "./ollama";

// All tool names the LLM can invoke
export type ToolName = "read_file" | "write_file" | "run_command" | "list_dir" | "search_files";

// Schema for a single tool call parsed from assistant output
export interface ToolCall {
  tool: ToolName;
  args: Record<string, string>;
}

// Parse tool calls from the assistant's message text using XML-style tags
export function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const toolRegex = /<tool\s+name="(\w+)">([\s\S]*?)<\/tool>/g;
  let match: RegExpExecArray | null;
  while ((match = toolRegex.exec(text)) !== null) {
    const tool = match[1] as ToolName;
    const body = match[2];
    const args: Record<string, string> = {};
    const argRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
    let argMatch: RegExpExecArray | null;
    while ((argMatch = argRegex.exec(body)) !== null) {
      args[argMatch[1]] = argMatch[2].trim();
    }
    calls.push({ tool, args });
  }
  return calls;
}

// Execute a single tool call and return the result text
export async function executeTool(call: ToolCall): Promise<string> {
  const root = getProjectRoot();
  switch (call.tool) {
    case "read_file": {
      const filePath = path.resolve(root, call.args.path || "");
      if (!fs.existsSync(filePath)) return `Error: file not found — ${call.args.path}`;
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        return truncate(content, 8000);
      } catch (e: any) {
        return `Error reading file: ${e.message}`;
      }
    }
    case "write_file": {
      const filePath = path.resolve(root, call.args.path || "");
      const content = call.args.content || "";
      try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, content, "utf-8");
        return `File written: ${call.args.path}`;
      } catch (e: any) {
        return `Error writing file: ${e.message}`;
      }
    }
    case "run_command": {
      const cmd = call.args.command || "";
      console.log(chalk.blue(`\n  [Tool] run_command: ${cmd}`));
      const result = await safeExecute(cmd, root);
      if (result.skipped) return "Command skipped by user.";
      if (result.code !== 0) {
        return `Command failed (exit ${result.code}):\n${truncate(result.stderr || result.stdout, 4000)}`;
      }
      return truncate(result.stdout, 4000) || "(no output)";
    }
    case "list_dir": {
      const dirPath = path.resolve(root, call.args.path || ".");
      if (!fs.existsSync(dirPath)) return `Error: directory not found — ${call.args.path}`;
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries
          .map((e) => (e.isDirectory() ? e.name + "/" : e.name))
          .join("\n");
      } catch (e: any) {
        return `Error listing directory: ${e.message}`;
      }
    }
    case "search_files": {
      const query = (call.args.query || "").toLowerCase();
      const dir = path.resolve(root, call.args.path || ".");
      const results: string[] = [];
      searchDir(dir, root, query, results, 0);
      if (results.length === 0) return "No matches found.";
      return results.slice(0, 30).join("\n");
    }
    default:
      return `Unknown tool: ${call.tool}`;
  }
}

// Recursively search files for content matching a query string
function searchDir(
  dir: string,
  root: string,
  query: string,
  results: string[],
  depth: number
): void {
  if (depth > 6 || results.length > 30) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      searchDir(full, root, query, results, depth + 1);
    } else if (entry.isFile()) {
      try {
        const content = fs.readFileSync(full, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(query)) {
            const rel = path.relative(root, full).replace(/\\/g, "/");
            results.push(`${rel}:${i + 1}: ${lines[i].trim()}`);
            if (results.length > 30) return;
          }
        }
      } catch {
        // skip binary / unreadable files
      }
    }
  }
}

// Build the tool-description block injected into the system prompt
export function toolDescriptions(): string {
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
- Never fabricate tool results.`;
}

// Process all tool calls in an assistant message and return results as a user message
export async function processToolCalls(
  assistantText: string
): Promise<{ results: string; hadCalls: boolean }> {
  const calls = parseToolCalls(assistantText);
  if (calls.length === 0) return { results: "", hadCalls: false };
  const parts: string[] = [];
  for (const call of calls) {
    const result = await executeTool(call);
    parts.push(`[${call.tool}] ${result}`);
  }
  return { results: parts.join("\n\n"), hadCalls: true };
}
