"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCommand = runCommand;
exports.safeExecute = safeExecute;
const child_process_1 = require("child_process");
const micromatch_1 = __importDefault(require("micromatch"));
const chalk_1 = __importDefault(require("chalk"));
const utils_1 = require("./utils");
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
function askConfirmation(question) {
    return new Promise((resolve) => {
        utils_1.rl.question(question, (answer) => {
            resolve(answer.trim().toLowerCase().startsWith("y"));
        });
    });
}
function isAutoApproved(cmd, patterns) {
    return patterns.some((pattern) => micromatch_1.default.isMatch(cmd, pattern));
}
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