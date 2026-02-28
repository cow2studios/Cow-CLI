export interface TreeNode {
    name: string;
    type: "file" | "dir";
    children?: TreeNode[];
}
export interface ExportEntry {
    file: string;
    symbols: string[];
}
export declare function reindex(): Promise<{
    tree: TreeNode[];
    exports: ExportEntry[];
}>;
export declare function loadCachedContext(): {
    tree: TreeNode[];
    exports: ExportEntry[];
} | null;
export declare function treeToString(nodes: TreeNode[], indent?: string): string;
export declare function exportsToString(entries: ExportEntry[]): string;
//# sourceMappingURL=context.d.ts.map