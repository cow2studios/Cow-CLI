export type ToolName = "read_file" | "write_file" | "run_command" | "list_dir" | "search_files";
export interface ToolCall {
    tool: ToolName;
    args: Record<string, string>;
}
export declare function parseToolCalls(text: string): ToolCall[];
export declare function executeTool(call: ToolCall): Promise<string>;
export declare function toolDescriptions(): string;
export declare function processToolCalls(assistantText: string): Promise<{
    results: string;
    hadCalls: boolean;
}>;
//# sourceMappingURL=tools.d.ts.map