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
exports.rl = void 0;
exports.getProjectRoot = getProjectRoot;
exports.projectPath = projectPath;
exports.cowInfoPath = cowInfoPath;
exports.ensureCowInfoDir = ensureCowInfoDir;
exports.ensureGitignore = ensureGitignore;
exports.loadCowIgnorePatterns = loadCowIgnorePatterns;
exports.loadCowAutoConfig = loadCowAutoConfig;
exports.printBanner = printBanner;
exports.isDestructiveCommand = isDestructiveCommand;
exports.truncate = truncate;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const chalk_1 = __importDefault(require("chalk"));
const readline = __importStar(require("readline"));
exports.rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk_1.default.green("cow> "),
});
function getProjectRoot() {
    return process.cwd();
}
function projectPath(...segments) {
    return path.join(getProjectRoot(), ...segments);
}
function cowInfoPath(...segments) {
    return path.join(getProjectRoot(), ".cowinfo", ...segments);
}
function ensureCowInfoDir() {
    const dir = cowInfoPath();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
function ensureGitignore() {
    const gitignorePath = projectPath(".gitignore");
    const entry = ".cowinfo/";
    if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, "utf-8");
        if (!content.split("\n").some((l) => l.trim() === entry)) {
            fs.appendFileSync(gitignorePath, "\n" + entry + "\n");
        }
    }
    else {
        fs.writeFileSync(gitignorePath, entry + "\n", "utf-8");
    }
}
function loadCowIgnorePatterns() {
    const ignorePath = projectPath(".cowignore");
    if (!fs.existsSync(ignorePath))
        return [];
    return fs
        .readFileSync(ignorePath, "utf-8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"));
}
function loadCowAutoConfig() {
    const autoPath = projectPath(".cowauto");
    const config = { patterns: [], autoErrorRecovery: true };
    if (!fs.existsSync(autoPath))
        return config;
    const lines = fs.readFileSync(autoPath, "utf-8").split("\n");
    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith("#"))
            continue;
        if (line.startsWith("autoErrorRecovery:")) {
            config.autoErrorRecovery = line.split(":")[1].trim() !== "false";
        }
        else {
            config.patterns.push(line);
        }
    }
    return config;
}
function printBanner() {
    const textArt = chalk_1.default.cyan.bold(`
   ____    ___   __        __     ____   _     ___ 
  / ___|  / _ \\  \\ \\      / /    / ___| | |   |_ _|
 | |     | | | |  \\ \\ /\\ / /    | |     | |    | | 
 | |___  | |_| |   \\ V  V /     | |___  | |___ | | 
  \\____|  \\___/     \\_/\\_/       \\____| |_____|___|
`);
    console.log(textArt);
    console.log(chalk_1.default.gray("  Local-first AI coding assistant powered by Ollama Built by Cow2Studios\n"));
}
const DESTRUCTIVE_PATTERNS = [
    /\brm\s+(-\w*\s+)*-?\w*r\w*f/i,
    /\brm\s+-rf\b/i,
    /\brmdir\s+\/s/i,
    /\bdel\s+\/s/i,
    /\bformat\s+/i,
    /\bmkfs\b/i,
    /\bdd\s+if=/i,
    />\s*\/dev\/sd/i,
    /\bdrop\s+database\b/i,
    /\bdrop\s+table\b/i,
];
function isDestructiveCommand(cmd) {
    return DESTRUCTIVE_PATTERNS.some((p) => p.test(cmd));
}
function truncate(str, maxChars) {
    if (str.length <= maxChars)
        return str;
    return str.slice(0, maxChars) + "\n... [truncated]";
}
//# sourceMappingURL=utils.js.map