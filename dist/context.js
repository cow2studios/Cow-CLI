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
exports.reindex = reindex;
exports.loadCachedContext = loadCachedContext;
exports.treeToString = treeToString;
exports.exportsToString = exportsToString;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const micromatch_1 = __importDefault(require("micromatch"));
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
const utils_1 = require("./utils");
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
// Check if a relative path should be ignored
function shouldIgnore(relPath, ignorePatterns) {
    const all = [...DEFAULT_IGNORE, ...ignorePatterns];
    const parts = relPath.split(path.sep);
    for (const part of parts) {
        if (micromatch_1.default.isMatch(part, all))
            return true;
    }
    return micromatch_1.default.isMatch(relPath, all);
}
// Recursively walk the directory tree and return a TreeNode
function walkTree(dir, root, ignorePatterns, maxDepth, currentDepth = 0) {
    if (currentDepth >= maxDepth)
        return [];
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return [];
    }
    const nodes = [];
    for (const entry of entries) {
        const relPath = path.relative(root, path.join(dir, entry.name));
        if (shouldIgnore(relPath, ignorePatterns))
            continue;
        if (entry.isDirectory()) {
            const children = walkTree(path.join(dir, entry.name), root, ignorePatterns, maxDepth, currentDepth + 1);
            nodes.push({ name: entry.name, type: "dir", children });
        }
        else if (entry.isFile()) {
            nodes.push({ name: entry.name, type: "file" });
        }
    }
    return nodes;
}
// Extract exported symbol names from a source file using simple regex
function extractExports(filePath) {
    try {
        const content = fs.readFileSync(filePath, "utf-8");
        const symbols = [];
        const patterns = [
            /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g,
            /export\s+\{([^}]+)\}/g,
            /module\.exports\s*=\s*\{([^}]+)\}/g,
            /(?:^|\n)def\s+(\w+)\s*\(/g,
            /(?:^|\n)class\s+(\w+)/g,
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const captured = match[1];
                if (captured.includes(",")) {
                    captured.split(",").forEach((s) => {
                        const name = s.trim().split(/\s+as\s+/).pop()?.trim();
                        if (name)
                            symbols.push(name);
                    });
                }
                else {
                    symbols.push(captured.trim());
                }
            }
        }
        return [...new Set(symbols)];
    }
    catch {
        return [];
    }
}
// Collect export entries for all source files in the project
function collectExports(dir, root, ignorePatterns) {
    const entries = [];
    let items;
    try {
        items = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return entries;
    }
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        const relPath = path.relative(root, fullPath);
        if (shouldIgnore(relPath, ignorePatterns))
            continue;
        if (item.isDirectory()) {
            entries.push(...collectExports(fullPath, root, ignorePatterns));
        }
        else if (item.isFile()) {
            const ext = path.extname(item.name).toLowerCase();
            if (!SOURCE_EXTENSIONS.has(ext))
                continue;
            const symbols = extractExports(fullPath);
            if (symbols.length > 0) {
                entries.push({ file: relPath.replace(/\\/g, "/"), symbols });
            }
        }
    }
    return entries;
}
// Re-index the project and write tree.json and exports.json into .cowinfo/
async function reindex() {
    const spinner = (0, ora_1.default)({ text: "Indexing project...", color: "yellow" }).start();
    const root = (0, utils_1.getProjectRoot)();
    const ignorePatterns = (0, utils_1.loadCowIgnorePatterns)();
    (0, utils_1.ensureCowInfoDir)();
    const tree = walkTree(root, root, ignorePatterns, 8);
    const exports = collectExports(root, root, ignorePatterns);
    fs.writeFileSync((0, utils_1.cowInfoPath)("tree.json"), JSON.stringify(tree, null, 2), "utf-8");
    fs.writeFileSync((0, utils_1.cowInfoPath)("exports.json"), JSON.stringify(exports, null, 2), "utf-8");
    spinner.succeed(chalk_1.default.gray("Project indexed"));
    return { tree, exports };
}
// Load cached tree.json and exports.json
function loadCachedContext() {
    const treePath = (0, utils_1.cowInfoPath)("tree.json");
    const exportsPath = (0, utils_1.cowInfoPath)("exports.json");
    if (!fs.existsSync(treePath) || !fs.existsSync(exportsPath))
        return null;
    try {
        const tree = JSON.parse(fs.readFileSync(treePath, "utf-8"));
        const exports = JSON.parse(fs.readFileSync(exportsPath, "utf-8"));
        return { tree, exports };
    }
    catch {
        return null;
    }
}
// Serialize the tree into a compact string for prompt injection
function treeToString(nodes, indent = "") {
    let out = "";
    for (const node of nodes) {
        if (node.type === "dir") {
            out += `${indent}${node.name}/\n`;
            if (node.children) {
                out += treeToString(node.children, indent + "  ");
            }
        }
        else {
            out += `${indent}${node.name}\n`;
        }
    }
    return out;
}
// Serialize exports into a compact string for prompt injection
function exportsToString(entries) {
    return entries
        .map((e) => `${e.file}: ${e.symbols.join(", ")}`)
        .join("\n");
}
//# sourceMappingURL=context.js.map