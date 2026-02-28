# Cow CLI 🐮

A Free and Open Source Command-Line Interface (CLI) AI Agent that lives in your terminal. Cow CLI acts as an autonomous coding assistant—similar to Claude Code or Gemini CLI—but is powered entirely by your local machine using **Ollama**. 

Zero API costs. Complete privacy. No cloud lock-in.

## Features

- **Local-First AI:** Runs entirely on local models via Ollama. 
- **Interactive REPL:** Type `cow` to enter a persistent chat session right in your working directory.
- **Context-Aware:** Intelligently maps your project structure without exhausting the context window, keeping it fast on any hardware.
- **Autonomous Execution:** Configure repetitive tasks (like `git commit` or `npm install`) to run without asking for permission.
- **Auto-Error Recovery:** If a command fails, the agent reads the error and attempts to fix it autonomously (safeguarded with a 5-try limit).
- **Safe Interrupts:** Hit `Ctrl+C` at any time to safely halt the agent's current thought loop without killing your terminal session.

## Installation

Cow CLI is built in TypeScript and distributed globally via npm. 

*Note: You must have [Ollama](https://ollama.com/) installed on your system.*

```bash
npm install -g cow-cli
```

## Getting Started

Navigate to any project directory and start the agent:

```bash
cd my-project
cow
```

If Ollama isn't already running, Cow CLI will automatically spin it up in the background and connect to the default port (`localhost:11434`).

## The `.cow` Ecosystem

Cow CLI manages its state locally in your project, ensuring it always remembers where you left off. 

### `.cowinfo/` (Project Index)
Upon initialization, Cow CLI maps your project and stores lightweight context files (`tree.json`, `exports.json`) here. This "Map & Tool" approach allows the agent to fetch only the code it needs, keeping memory usage low. Chat sessions are also saved here as `.cowhistory`. 
*(Note: Cow CLI automatically adds this directory to your `.gitignore`)*

### `.cowauto` (Autonomous Permissions)
Don't want to confirm every single command? Create a `.cowauto` file at the root of your project and use standard glob matching to grant the agent autonomous execution rights:

```text
git add *
git commit -m *
npm install *
autoErrorRecovery: true
```

### `.cowignore` (Context Exclusion)
Works exactly like a `.gitignore`. Tell Cow CLI which directories or files it should never read, index, or modify:

```text
node_modules/
.env
dist/
```

## Roadmap

- **Text Parsing Fallback:** Adding support for non-tool-calling models by parsing markdown code blocks.
- **Local RAG / Embeddings:** An opt-in feature to use local vector databases for massive, enterprise-scale codebases.
- **Regex Automation:** Upgrading `.cowauto` to support complex regex patterns for fine-grained execution permissions.
- **Online API:** Option to use APIs of Online Models such as Claude and Gemini if the user requires State of the Art Models.

## License

[MIT License](LICENSE). Free and Open Source.