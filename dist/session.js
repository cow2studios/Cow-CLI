"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSessions = loadSessions;
exports.saveSessions = saveSessions;
exports.createSession = createSession;
exports.getOrCreateLatestSession = getOrCreateLatestSession;
exports.appendMessage = appendMessage;
exports.startNewSession = startNewSession;
exports.trimMessages = trimMessages;
const fs = __importStar(require("fs"));
const utils_1 = require("./utils");
const HISTORY_FILE = "cowhistory.json";
const MAX_HISTORY_MESSAGES = 200;
// Load all sessions from the history file
function loadSessions() {
    (0, utils_1.ensureCowInfoDir)();
    const filePath = (0, utils_1.cowInfoPath)(HISTORY_FILE);
    if (!fs.existsSync(filePath))
        return [];
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
    catch {
        return [];
    }
}
// Save all sessions to the history file
function saveSessions(sessions) {
    (0, utils_1.ensureCowInfoDir)();
    fs.writeFileSync((0, utils_1.cowInfoPath)(HISTORY_FILE), JSON.stringify(sessions, null, 2), "utf-8");
}
// Create a new empty session
function createSession() {
    return {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        createdAt: new Date().toISOString(),
        messages: [],
    };
}
// Get the most recent session or create a new one
function getOrCreateLatestSession() {
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
function appendMessage(session, msg) {
    session.messages.push(msg);
    if (session.messages.length > MAX_HISTORY_MESSAGES) {
        session.messages = session.messages.slice(-MAX_HISTORY_MESSAGES);
    }
    const sessions = loadSessions();
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
        sessions[idx] = session;
    }
    else {
        sessions.push(session);
    }
    saveSessions(sessions);
}
// Start a fresh session and persist it
function startNewSession() {
    const sessions = loadSessions();
    const session = createSession();
    sessions.push(session);
    saveSessions(sessions);
    return session;
}
// Build a trimmed message list that fits within a token budget
function trimMessages(messages, maxChars) {
    let total = 0;
    const result = [];
    for (let i = messages.length - 1; i >= 0; i--) {
        const len = messages[i].content.length;
        if (total + len > maxChars)
            break;
        total += len;
        result.unshift(messages[i]);
    }
    return result;
}
//# sourceMappingURL=session.js.map