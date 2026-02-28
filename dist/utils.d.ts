export declare function getProjectRoot(): string;
export declare function projectPath(...segments: string[]): string;
export declare function cowInfoPath(...segments: string[]): string;
export declare function ensureCowInfoDir(): void;
export declare function ensureGitignore(): void;
export declare function loadCowIgnorePatterns(): string[];
export interface CowAutoConfig {
    patterns: string[];
    autoErrorRecovery: boolean;
}
export declare function loadCowAutoConfig(): CowAutoConfig;
export declare function printBanner(): void;
export declare function isDestructiveCommand(cmd: string): boolean;
export declare function truncate(str: string, maxChars: number): string;
//# sourceMappingURL=utils.d.ts.map