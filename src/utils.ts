import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";

// Resolve the project root directory (cwd)
export function getProjectRoot(): string {
  return process.cwd();
}

// Resolve a path relative to the project root
export function projectPath(...segments: string[]): string {
  return path.join(getProjectRoot(), ...segments);
}

// Resolve a path inside the .cowinfo directory
export function cowInfoPath(...segments: string[]): string {
  return path.join(getProjectRoot(), ".cowinfo", ...segments);
}

// Ensure the .cowinfo directory exists
export function ensureCowInfoDir(): void {
  const dir = cowInfoPath();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Ensure .cowinfo/ is listed in .gitignore
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

// Read the .cowignore file and return an array of patterns
export function loadCowIgnorePatterns(): string[] {
  const ignorePath = projectPath(".cowignore");
  if (!fs.existsSync(ignorePath)) return [];
  return fs
    .readFileSync(ignorePath, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

// Parse the .cowauto file for auto-approved globs and settings
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

// Print a styled banner at startup
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

// Destructive command patterns that always require explicit confirmation
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

// Check if a command looks destructive
export function isDestructiveCommand(cmd: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((p) => p.test(cmd));
}

// Truncate a string to a maximum token-approximate length for context window savings
export function truncate(str: string, maxChars: number): string {
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars) + "\n... [truncated]";
}
