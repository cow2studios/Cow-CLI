export declare function runCommand(cmd: string, cwd: string): Promise<{
    code: number;
    stdout: string;
    stderr: string;
}>;
export declare function safeExecute(cmd: string, cwd: string): Promise<{
    code: number;
    stdout: string;
    stderr: string;
    skipped: boolean;
}>;
//# sourceMappingURL=executor.d.ts.map