import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import * as readline from "readline";

export const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: chalk.green("cow> "),
});

export function getProjectRoot(): string {
  return process.cwd();
}

export function projectPath(...segments: string[]): string {
  return path.join(getProjectRoot(), ...segments);
}

export function cowInfoPath(...segments: string[]): string {
  return path.join(getProjectRoot(), ".cowinfo", ...segments);
}

export function ensureCowInfoDir(): void {
  const dir = cowInfoPath();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function ensureGitignore(): void {
  const gitignorePath = projectPath(".gitignore");
  const entry = ".cowinfo/";
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, "utf-8");
    if (!content.split("\n").some((l) => l.trim() === entry)) {
      fs.appendFileSync(gitignorePath, "\n" + entry + "\n");
    }
  } else {
    fs.writeFileSync(gitignorePath, entry + "\n", "utf-8");
  }
}

export function loadCowIgnorePatterns(): string[] {
  const ignorePath = projectPath(".cowignore");
  if (!fs.existsSync(ignorePath)) return [];
  return fs
    .readFileSync(ignorePath, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

export interface CowAutoConfig {
  patterns: string[];
  autoErrorRecovery: boolean;
}

export function loadCowAutoConfig(): CowAutoConfig {
  const autoPath = projectPath(".cowauto");
  const config: CowAutoConfig = { patterns: [], autoErrorRecovery: true };
  if (!fs.existsSync(autoPath)) return config;
  const lines = fs.readFileSync(autoPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("autoErrorRecovery:")) {
      config.autoErrorRecovery = line.split(":")[1].trim() !== "false";
    } else {
      config.patterns.push(line);
    }
  }
  return config;
}

export function printBanner(): void {
  const textArt = chalk.cyan.bold(`
   ____    ___   __        __     ____   _     ___ 
  / ___|  / _ \\  \\ \\      / /    / ___| | |   |_ _|
 | |     | | | |  \\ \\ /\\ / /    | |     | |    | | 
 | |___  | |_| |   \\ V  V /     | |___  | |___ | | 
  \\____|  \\___/     \\_/\\_/       \\____| |_____|___|
`);

  console.log(textArt);
  console.log(
    chalk.gray("  Local-first AI coding assistant powered by Ollama Built by Cow2Studios\n")
  );
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

export function isDestructiveCommand(cmd: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((p) => p.test(cmd));
}

export function truncate(str: string, maxChars: number): string {
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars) + "\n... [truncated]";
}