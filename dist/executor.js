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
exports.runCommand = runCommand;
exports.safeExecute = safeExecute;
const readline = __importStar(require("readline"));
const child_process_1 = require("child_process");
const micromatch_1 = __importDefault(require("micromatch"));
const chalk_1 = __importDefault(require("chalk"));
const utils_1 = require("./utils");
// Execute a shell command and return its combined output
function runCommand(cmd, cwd) {
    return new Promise((resolve) => {
        const isWindows = process.platform === "win32";
        const shell = isWindows ? "cmd" : "/bin/sh";
        const flag = isWindows ? "/c" : "-c";
        const child = (0, child_process_1.spawn)(shell, [flag, cmd], {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env },
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d.toString()));
        child.stderr.on("data", (d) => (stderr += d.toString()));
        child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
        child.on("error", (err) => resolve({ code: 1, stdout: "", stderr: err.message }));
    });
}
// Prompt the user for Y/N confirmation in the terminal
function askConfirmation(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase().startsWith("y"));
        });
    });
}
// Determine if a command is auto-approved based on .cowauto patterns
function isAutoApproved(cmd, patterns) {
    return patterns.some((pattern) => micromatch_1.default.isMatch(cmd, pattern));
}
// Execute a command with safety checks and optional user confirmation
async function safeExecute(cmd, cwd) {
    const config = (0, utils_1.loadCowAutoConfig)();
    if ((0, utils_1.isDestructiveCommand)(cmd)) {
        console.log(chalk_1.default.red.bold("\n⚠  Destructive command detected: ") + chalk_1.default.white(cmd));
        const ok = await askConfirmation(chalk_1.default.yellow("  Execute? (y/N): "));
        if (!ok) {
            console.log(chalk_1.default.gray("  Skipped."));
            return { code: 0, stdout: "", stderr: "", skipped: true };
        }
    }
    else if (!isAutoApproved(cmd, config.patterns)) {
        console.log(chalk_1.default.cyan("\n  Command: ") + chalk_1.default.white(cmd));
        const ok = await askConfirmation(chalk_1.default.yellow("  Execute? (y/N): "));
        if (!ok) {
            console.log(chalk_1.default.gray("  Skipped."));
            return { code: 0, stdout: "", stderr: "", skipped: true };
        }
    }
    else {
        console.log(chalk_1.default.gray(`  Auto-executing: ${cmd}`));
    }
    const result = await runCommand(cmd, cwd);
    if (result.stdout.trim()) {
        console.log(chalk_1.default.white((0, utils_1.truncate)(result.stdout.trim(), 2000)));
    }
    if (result.stderr.trim() && result.code !== 0) {
        console.log(chalk_1.default.red((0, utils_1.truncate)(result.stderr.trim(), 2000)));
    }
    return { ...result, skipped: false };
}
//# sourceMappingURL=executor.js.map