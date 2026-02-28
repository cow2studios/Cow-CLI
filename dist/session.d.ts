import { OllamaMessage } from "./ollama";
export interface Session {
    id: string;
    createdAt: string;
    messages: OllamaMessage[];
}
export declare function loadSessions(): Session[];
export declare function saveSessions(sessions: Session[]): void;
export declare function createSession(): Session;
export declare function getOrCreateLatestSession(): Session;
export declare function appendMessage(session: Session, msg: OllamaMessage): void;
export declare function startNewSession(): Session;
export declare function trimMessages(messages: OllamaMessage[], maxChars: number): OllamaMessage[];
//# sourceMappingURL=session.d.ts.map