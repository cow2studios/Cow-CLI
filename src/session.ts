import * as fs from "fs";
import { cowInfoPath, ensureCowInfoDir } from "./utils";
import { OllamaMessage } from "./ollama";

const HISTORY_FILE = "cowhistory.json";
const MAX_HISTORY_MESSAGES = 200;

// Represents a persisted chat session
export interface Session {
  id: string;
  createdAt: string;
  messages: OllamaMessage[];
}

// Load all sessions from the history file
export function loadSessions(): Session[] {
  ensureCowInfoDir();
  const filePath = cowInfoPath(HISTORY_FILE);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Session[];
  } catch {
    return [];
  }
}

// Save all sessions to the history file
export function saveSessions(sessions: Session[]): void {
  ensureCowInfoDir();
  fs.writeFileSync(
    cowInfoPath(HISTORY_FILE),
    JSON.stringify(sessions, null, 2),
    "utf-8"
  );
}

// Create a new empty session
export function createSession(): Session {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createdAt: new Date().toISOString(),
    messages: [],
  };
}

// Get the most recent session or create a new one
export function getOrCreateLatestSession(): Session {
  const sessions = loadSessions();
  if (sessions.length > 0) {
    return sessions[sessions.length - 1];
  }
  const session = createSession();
  sessions.push(session);
  saveSessions(sessions);
  return session;
}

// Append a message to the active session and persist
export function appendMessage(session: Session, msg: OllamaMessage): void {
  session.messages.push(msg);
  if (session.messages.length > MAX_HISTORY_MESSAGES) {
    session.messages = session.messages.slice(-MAX_HISTORY_MESSAGES);
  }
  const sessions = loadSessions();
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.push(session);
  }
  saveSessions(sessions);
}

// Start a fresh session and persist it
export function startNewSession(): Session {
  const sessions = loadSessions();
  const session = createSession();
  sessions.push(session);
  saveSessions(sessions);
  return session;
}

// Build a trimmed message list that fits within a token budget
export function trimMessages(
  messages: OllamaMessage[],
  maxChars: number
): OllamaMessage[] {
  let total = 0;
  const result: OllamaMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const len = messages[i].content.length;
    if (total + len > maxChars) break;
    total += len;
    result.unshift(messages[i]);
  }
  return result;
}
