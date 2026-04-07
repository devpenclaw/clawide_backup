# ClawIDE 🐾

ClawIDE is a custom-built Integrated Development Environment that connects directly to an **OpenClaw** gateway — either running on a VPS or locally. It features a GitHub-dark themed interface with real-time AI chat, streaming agent responses, inline code edits (Cmd+K), a Monaco editor, and an embedded terminal.

## 🌟 Features

- **Streaming Chat** — Talk to the OpenClaw agent in the sidebar; responses stream token-by-token
- **Cmd+K Inline Edits** — Select code and ask the agent to rewrite, explain, or refactor it
- **Monaco Editor** — VS Code's editor engine with tab management and syntax highlighting for 20+ languages
- **Embedded Terminal** — Real shell in the browser via PTY (falls back to `child_process` if PTY is unavailable)
- **Activity Bar** — Switch between chat and file explorer views
- **Status Bar** — Live gateway connection status
- **Electron Desktop** — Optionally run as a native desktop app

## 🏗️ Architecture

```
[Browser / Electron: React + Vite (port 5173)]
          ↕  Socket.IO (WebSocket)
[Local: Node.js/Express backend (port 3000)]
          ↕  WebSocket (Gateway WS protocol v3)  ←→  OpenClaw Gateway (port 18789)
          ↕  HTTP POST /hooks/agent              ←→  OpenClaw Gateway (port 18789)
```

**How messages flow:**
1. Frontend sends `chat-message` via Socket.IO to the local backend
2. Backend POSTs to `/hooks/agent` on the OpenClaw gateway (HTTP)
3. The gateway fires the agent and streams events back over the persistent WebSocket connection
4. Backend forwards `agent-delta` events to the frontend in real-time
5. When the run completes, backend emits `agent-response` with the full reply

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- npm
- An **OpenClaw gateway** running — either locally or on a VPS (port 18789)
- The gateway's **operator token** (found in your `openclaw.json` config)

---

### Option A: OpenClaw on a VPS (recommended)

```bash
# 1. Clone
git clone https://github.com/devpenclaw/ClawIDE.git
cd ClawIDE

# 2. Install all dependencies
npm run install-all

# 3. Create a .env file in the project root
cat > .env << 'EOF'
VPS_OPENCLAW_URL=http://YOUR_VPS_IP:18789
OPENCLAW_GATEWAY_TOKEN=your_operator_token_here
EOF

# 4. Start both servers
npm run dev

# 5. Open http://localhost:5173
```

---

### Option B: OpenClaw running locally

```bash
# 1. Clone
git clone https://github.com/devpenclaw/ClawIDE.git
cd ClawIDE

# 2. Install all dependencies
npm run install-all

# 3. Create a .env file pointing to localhost
cat > .env << 'EOF'
VPS_OPENCLAW_URL=http://localhost:18789
OPENCLAW_GATEWAY_TOKEN=your_operator_token_here
EOF

# 4. Start both servers (OpenClaw gateway must already be running)
npm run dev

# 5. Open http://localhost:5173
```

---

### Option C: Electron Desktop App

```bash
# After installing dependencies and creating .env:
npm run electron-dev
```

---

## 🔧 Configuration

Create a `.env` file in the **project root** (not inside `client/` or `server/`):

```env
# URL of your OpenClaw gateway (http or ws — both work, http is preferred)
VPS_OPENCLAW_URL=http://your-vps-ip-or-domain:18789

# Operator token from your openclaw.json
OPENCLAW_GATEWAY_TOKEN=your_token_here
```

> `.env` is git-ignored. Never commit your token.

### Where to find your token

On your VPS (or local machine running OpenClaw), open `openclaw.json` and look for the `token` field under `gateway` or `hooks`. Copy that value into `OPENCLAW_GATEWAY_TOKEN`.

### OpenClaw gateway `openclaw.json` requirements

The following must be enabled in your gateway config for ClawIDE to work:

```json
{
  "hooks": {
    "enabled": true,
    "token": "same_token_as_above",
    "path": "/hooks"
  }
}
```

---

## 🔌 How the Gateway Connection Works

ClawIDE uses a **hybrid WebSocket + HTTP** approach:

| Channel | Purpose |
|---------|---------|
| WebSocket (`ws://gateway:18789`) | Persistent connection — receives streaming agent events |
| HTTP POST `/hooks/agent` | Triggers agent runs (fire-and-forget, returns `runId`) |

The WebSocket connects using the OpenClaw control protocol (v3):
- `client.id`: `cli`
- `client.mode`: `cli`
- `role`: `operator`
- Handles `connect.challenge` → `connect` handshake → `hello-ok`

Agent events arrive tagged with the `runId` from the HTTP call, so the backend can route deltas to the correct frontend socket.

---

## 📁 Project Structure

```
ClawIDE/
├── client/              # React + Vite frontend
│   └── src/
│       ├── App.jsx      # Main IDE layout (editor, chat, terminal, activity bar)
│       ├── App.css      # GitHub-dark theme styles
│       ├── CmdKModal.jsx  # Cmd+K inline edit modal
│       └── CmdKModal.css
├── server/
│   ├── index.js         # Express + Socket.IO backend
│   └── openclaw-client.js  # OpenClaw Gateway WS client
├── electron/            # Electron wrapper (optional desktop app)
├── .env                 # Your config (git-ignored)
└── package.json         # Root scripts (dev, install-all, electron)
```

---

## 🛠️ Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both backend (port 3000) and frontend (port 5173) |
| `npm run server-dev` | Start only the backend |
| `npm run client-dev` | Start only the frontend |
| `npm run install-all` | Install dependencies in root, client, and server |
| `npm run electron-dev` | Run as Electron desktop app |
| `npm run dist` | Build distributable Electron app |

---

## 🔐 Security Notes

- Keep your `OPENCLAW_GATEWAY_TOKEN` secret — it grants operator access to your gateway
- For internet-exposed VPS, consider placing OpenClaw behind a reverse proxy (nginx/caddy) with TLS
- The local backend (port 3000) only accepts connections from `localhost:5173` by default

## 📂 Project Structure

```
clawide/
├── client/          # React/Vite frontend with Monaco Editor
│   ├── src/         # Source code (App.jsx, CmdKModal, etc.)
│   ├── public/      /* Static assets
│   ├── package.json
│   └── vite.config.js
├── server/          # Node.js/Express backend with Socket.io
│   ├── index.js     # Main server with OpenClaw HTTP integration
│   └── package.json
├── electron/        # Electron desktop app foundation
│   ├── main.js      # Main process with macOS menu
│   ├── preload.js   /* Secure renderer-main communication
│   ├── assets/      /* App icons
│   └── package.json
├── docs/            /* Documentation
│   └── PROJECT_TRACKER.md
├── package.json     /* Root package.json and scripts
├── .gitignore       /* Git ignore rules
└── README.md        /* This file
```

## 🛠️ Development Scripts

```bash
# Install all dependencies (root, client, server)
npm run install-all

# Start development servers (frontend + backend)
npm run dev

# Start only frontend (Vite dev server)
npm run client-dev

# Start only backend (Express server)
npm run server-dev

# Run Electron desktop app
npm run electron

# Run Electron with hot reload (frontend dev + electron)
npm run electron-dev

# Create distributable builds
npm run pack   # Creates output in dist/
npm run dist   # Creates DMG/PKG installers
```

## 🔑 Environment Variables

| Variable | Description | Example |
| :--- | :--- | :--- |
| `VPS_OPENCLAW_URL` | URL of your OpenClaw agent HTTP endpoint | `http://123.45.67.89:18789` |
| `PORT` | Port for the ClawIDE backend server | `3000` (default) |

### Example Usage:
```bash
export VPS_OPENCLAW_URL=http://162.62.226.231:18789
export PORT=3000
npm run dev
```

## 🐛 Troubleshooting

### Common Issues

#### "vite: command not found"
```bash
# Solution: Install client dependencies
cd client
npm install
```

#### "Address already in use"
```bash
# Solution: Kill process on port 3000 or 5173
lsof -ti:3000 lsof -ti:5173 | xargs kill -9 2>/dev/null || true
# Or on Windows PowerShell:
# Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
```

#### "Failed to connect to OpenClaw"
1. Verify `VPS_OPENCLAW_URL` is set correctly
2. Test from your machine: `curl -X POST http://your-vps-ip:18789/agent/run -d '{"prompt":"test"}'`
3. Check VPS firewall allows access to port 18789
4. Ensure OpenClaw is running and accessible on the VPS
5. Check VPS OpenClaw logs for incoming requests

### OpenClaw VPS Setup
To run OpenClaw in HTTP mode on your VPS:
```bash
# Check if your OpenClaw version supports HTTP mode:
openclaw agent run --help

# If it supports HTTP:
openclaw agent run --http --port 18789 --host 0.0.0.0

# If not, you may need to:
# 1. Use SSH tunneling (see below)
# 2. Or check OpenClaw documentation for server mode
```

### SSH Tunnel Alternative (Most Secure)
Instead of exposing OpenClaw directly:
```bash
# On your development machine:
ssh -L 18789:localhost:18789 your_vps_user@your_vps_ip
# Keep this running - it forwards local port 18789 to VPS port 18789

# Then set:
export VPS_OPENCLAW_URL=http://localhost:18789
# Your backend will connect to localhost:18789, which goes through the tunnel to your VPS
```

## 📈 Roadmap

### ✅ Completed
- Core web interface (React/Vite + Monaco Editor + Terminal)
- Real OpenClaw integration (HTTP client to VPS, correct default port 18789)
- Electron desktop app foundation
- Comprehensive documentation

### 🚧 In Progress
- Persistent chat history (LocalStorage)
- Agent-initiated actions (with user approval)
- Build/Plan agent UI (DAG visualization)
- Voice interface (Web Speech API)
- Advanced security options (API keys, JWT)

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [React](https://reactjs.org/), [Vite](https://vitejs.dev/), [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- Backend powered by [Node.js](https://nodejs.org/), [Express](https://expressjs.com/), [Socket.io](https://socket.io/)
- Electron desktop app framework
- OpenClaw agent for AI-powered assistance
- Inspired by modern IDEs and AI-assisted development tools

---

### 🚀 Ready to Start?

```bash
# Clone and setup
git clone https://github.com/devpenclaw/ClawIDE.git
cd clawide
npm run install-all
npm install -g openclaw

# Configure your VPS connection (CRITICAL: Use port 18789, not 3001!)
export VPS_OPENCLAW_URL=http://your-vps-ip:18789

# Start developing!
npm run dev
# Then visit: http://localhost:5173
```

Happy coding with your AI-powered development assistant! 🐾