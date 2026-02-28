import * as fs from "fs";
import * as path from "path";
import micromatch from "micromatch";
import ora from "ora";
import chalk from "chalk";
import {
  getProjectRoot,
  cowInfoPath,
  ensureCowInfoDir,
  loadCowIgnorePatterns,
  truncate,
} from "./utils";

// Default directories and files to always ignore during indexing
const DEFAULT_IGNORE = [
  "node_modules",
  ".git",
  ".cowinfo",
  "dist",
  "build",
  ".next",
  ".cache",
  "__pycache__",
  ".venv",
  "venv",
  "coverage",
  ".nyc_output",
  ".DS_Store",
  "Thumbs.db",
  "*.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
];

// File extensions considered source code for export scanning
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cs",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".scala",
  ".vue",
  ".svelte",
]);

// Represents one node in the directory tree map
export interface TreeNode {
  name: string;
  type: "file" | "dir";
  children?: TreeNode[];
}

// Represents an exported symbol (function, class, etc.)
export interface ExportEntry {
  file: string;
  symbols: string[];
}

// Check if a relative path should be ignored
function shouldIgnore(relPath: string, ignorePatterns: string[]): boolean {
  const all = [...DEFAULT_IGNORE, ...ignorePatterns];
  const parts = relPath.split(path.sep);
  for (const part of parts) {
    if (micromatch.isMatch(part, all)) return true;
  }
  return micromatch.isMatch(relPath, all);
}

// Recursively walk the directory tree and return a TreeNode
function walkTree(
  dir: string,
  root: string,
  ignorePatterns: string[],
  maxDepth: number,
  currentDepth = 0
): TreeNode[] {
  if (currentDepth >= maxDepth) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes: TreeNode[] = [];
  for (const entry of entries) {
    const relPath = path.relative(root, path.join(dir, entry.name));
    if (shouldIgnore(relPath, ignorePatterns)) continue;
    if (entry.isDirectory()) {
      const children = walkTree(
        path.join(dir, entry.name),
        root,
        ignorePatterns,
        maxDepth,
        currentDepth + 1
      );
      nodes.push({ name: entry.name, type: "dir", children });
    } else if (entry.isFile()) {
      nodes.push({ name: entry.name, type: "file" });
    }
  }
  return nodes;
}

// Extract exported symbol names from a source file using simple regex
function extractExports(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const symbols: string[] = [];
    const patterns = [
      /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g,
      /export\s+\{([^}]+)\}/g,
      /module\.exports\s*=\s*\{([^}]+)\}/g,
      /(?:^|\n)def\s+(\w+)\s*\(/g,
      /(?:^|\n)class\s+(\w+)/g,
    ];
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const captured = match[1];
        if (captured.includes(",")) {
          captured.split(",").forEach((s) => {
            const name = s.trim().split(/\s+as\s+/).pop()?.trim();
            if (name) symbols.push(name);
          });
        } else {
          symbols.push(captured.trim());
        }
      }
    }
    return [...new Set(symbols)];
  } catch {
    return [];
  }
}

// Collect export entries for all source files in the project
function collectExports(
  dir: string,
  root: string,
  ignorePatterns: string[]
): ExportEntry[] {
  const entries: ExportEntry[] = [];
  let items: fs.Dirent[];
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return entries;
  }
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    const relPath = path.relative(root, fullPath);
    if (shouldIgnore(relPath, ignorePatterns)) continue;
    if (item.isDirectory()) {
      entries.push(...collectExports(fullPath, root, ignorePatterns));
    } else if (item.isFile()) {
      const ext = path.extname(item.name).toLowerCase();
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      const symbols = extractExports(fullPath);
      if (symbols.length > 0) {
        entries.push({ file: relPath.replace(/\\/g, "/"), symbols });
      }
    }
  }
  return entries;
}

// Re-index the project and write tree.json and exports.json into .cowinfo/
export async function reindex(): Promise<{ tree: TreeNode[]; exports: ExportEntry[] }> {
  const spinner = ora({ text: "Indexing project...", color: "yellow" }).start();
  const root = getProjectRoot();
  const ignorePatterns = loadCowIgnorePatterns();
  ensureCowInfoDir();
  const tree = walkTree(root, root, ignorePatterns, 8);
  const exports = collectExports(root, root, ignorePatterns);
  fs.writeFileSync(cowInfoPath("tree.json"), JSON.stringify(tree, null, 2), "utf-8");
  fs.writeFileSync(cowInfoPath("exports.json"), JSON.stringify(exports, null, 2), "utf-8");
  spinner.succeed(chalk.gray("Project indexed"));
  return { tree, exports };
}

// Load cached tree.json and exports.json
export function loadCachedContext(): { tree: TreeNode[]; exports: ExportEntry[] } | null {
  const treePath = cowInfoPath("tree.json");
  const exportsPath = cowInfoPath("exports.json");
  if (!fs.existsSync(treePath) || !fs.existsSync(exportsPath)) return null;
  try {
    const tree = JSON.parse(fs.readFileSync(treePath, "utf-8")) as TreeNode[];
    const exports = JSON.parse(fs.readFileSync(exportsPath, "utf-8")) as ExportEntry[];
    return { tree, exports };
  } catch {
    return null;
  }
}

// Serialize the tree into a compact string for prompt injection
export function treeToString(nodes: TreeNode[], indent = ""): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "dir") {
      out += `${indent}${node.name}/\n`;
      if (node.children) {
        out += treeToString(node.children, indent + "  ");
      }
    } else {
      out += `${indent}${node.name}\n`;
    }
  }
  return out;
}

// Serialize exports into a compact string for prompt injection
export function exportsToString(entries: ExportEntry[]): string {
  return entries
    .map((e) => `${e.file}: ${e.symbols.join(", ")}`)
    .join("\n");
}
