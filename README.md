# ClawIDE 🐾

ClawIDE is a custom-built Integrated Development Environment designed to integrate directly with the **OpenClaw** agent. It features a modern interface with AI-assisted coding, real-time chat, and an embedded terminal.

## 🚀 Features

- **Sidebar Chat:** Interact with the OpenClaw agent directly within your workspace.
- **Inline Edits:** Use "Cmd+K" style commands to generate and apply code changes.
- **Integrated Terminal:** Run commands and view output without leaving the IDE.
- **Project Tree:** Navigate your file system with context-aware agent support.

## 🛠️ Tech Stack

- **Frontend:** React, Vite, Monaco Editor, Xterm.js
- **Backend:** Node.js, Express, Socket.io, node-pty
- **Agent:** OpenClaw (installed separately)

## 🏗️ Getting Started

### Prerequisites
- Node.js (v18+)
- npm
- OpenClaw CLI (installed globally)

### Installation

1. **Install OpenClaw globally** (required for agent integration):
   ```bash
   npm install -g openclaw
   ```

2. **Clone and install ClawIDE:**
   ```bash
   git clone https://github.com/yourusername/clawide.git
   cd clawide
   npm install
   ```

### Running the Project

```bash
npm run dev
```

This will start:
- Frontend dev server on http://localhost:5173
- Backend API server on http://localhost:3000

## 📂 Project Structure

- `client/`: The React-based frontend.
- `server/`: The Node.js backend handling agent communication via OpenClaw CLI.
- `docs/`: Project tracker and documentation.

## 🔧 Configuration

The backend communicates with OpenClaw via its CLI interface. Make sure:
1. OpenClaw is installed globally: `npm install -g openclaw`
2. You have configured your OpenClaw instance (Discord bridge, etc.)
3. The `openclaw` command is available in your PATH

## 📈 Roadmap

See [PROJECT_TRACKER.md](docs/PROJECT_TRACKER.md) for current progress and upcoming features.

## 🤝 Contributing

This project was built as an MVP for solo development. Feel free to fork and enhance!
