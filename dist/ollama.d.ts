export declare function ensureOllama(): Promise<void>;
export interface OllamaMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
export declare function streamChat(messages: OllamaMessage[], onToken: (token: string) => void, signal?: AbortSignal): Promise<string>;
export declare function cleanupOllama(): void;
//# sourceMappingURL=ollama.d.ts.map