# ClawIDE 🐾

ClawIDE is a custom-built Integrated Development Environment designed to integrate directly with the **OpenClaw** agent. It features a modern interface with AI-assisted coding, real-time chat, and an embedded terminal.

## 🌟 Key Features

- **Sidebar Chat:** Interact with the OpenClaw agent directly within your workspace
- **Inline Edits:** Use "Cmd+K" style commands to generate and apply code changes
- **Integrated Terminal:** Run commands and view output without leaving the IDE
- **Project Tree:** Navigate your file system with context-aware agent support
- **Cross-Platform:** Works as a web app or Electron desktop application
- **VPS-Ready:** Easily configure to use OpenClaw running on a remote server

## 🏗️ Architecture

```
[Local PC: Frontend (React/Vite)] 
      ↓ Socket.IO 
[Local PC: Backend (Node.js/Express)] 
      ↓ HTTP API 
[VPS or Local: OpenClaw Agent] 
      ↓ Results 
[Local PC: Backend] 
      ↓ Socket.IO 
[Local PC: Frontend (React/Vite)]
```

## 🚀 Quick Start

### Prerequisites
- Node.js (v18+)
- npm
- OpenClaw (installed globally OR accessible via VPS)

### Option A: Local Development (OpenClaw runs on your PC)
```bash
# 1. Clone the repository
git clone https://github.com/devpenclaw/ClawIDE.git
cd clawide

# 2. Install dependencies
npm run install-all

# 3. Install OpenClaw globally (required for agent features)
npm install -g openclaw

# 4. Start the development servers
npm run dev

# 5. Open your browser to:
#    http://localhost:5173
```

### Option B: VPS Setup (OpenClaw runs on remote server)
```bash
# 1. Clone the repository
git clone https://github.com/devpenclaw/ClawIDE.git
cd clawide

# 2. Install dependencies
npm run install-all

# 3. Install OpenClaw locally (needed for HTTP client)
npm install -g openclaw

# 4. Configure VPS connection
#    Edit .env file or set environment variable:
export VPS_OPENCLAW_URL=http://your-vps-ip-or-domain:3001
#    OR create a .env file in the root:
#    VPS_OPENCLAW_URL=http://your-vps-ip-or-domain:3001

# 5. Start the development servers
npm run dev

# 6. Open your browser to:
#    http://localhost:5173
```

## 🔧 Configuration

### VPS OpenClaw Connection
The backend connects to your OpenClaw instance via HTTP. Configure using:

**Environment Variable (Recommended):**
```bash
export VPS_OPENCLAW_URL=http://your-vps-ip-or-domain:3001
```

**Or .env File:**
Create a `.env` file in the project root:
```
VPS_OPENCLAW_URL=http://your-vps-ip-or-domain:3001
```

### Security Notes
- For development: The defaults work fine for local-only use
- For production/VPS exposure: Consider adding authentication
- For maximum security: Use SSH tunneling instead of direct HTTP exposure

## 📂 Project Structure

```
clawide/
├── client/          # React/Vite frontend with Monaco Editor
│   ├── src/         # Source code (App.jsx, CmdKModal, etc.)
│   ├── public/      # Static assets
│   ├── package.json
│   └── vite.config.js
├── server/          # Node.js/Express backend with Socket.io
│   ├── index.js     # Main server with OpenClaw HTTP integration
│   └── package.json
├── electron/        # Electron desktop app foundation
│   ├── main.js      # Main process with macOS menu
│   ├── preload.js   # Secure renderer-main communication
│   ├── assets/      # App icons
│   └── package.json
├── docs/            # Documentation
│   └── PROJECT_TRACKER.md
├── package.json     # Root package.json and scripts
├── .gitignore       # Git ignore rules
└── README.md        # This file
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
| `VPS_OPENCLAW_URL` | URL of your OpenClaw agent HTTP endpoint | `http://123.45.67.89:3001` |
| `PORT` | Port for the ClawIDE backend server | `3000` (default) |

### Example Usage:
```bash
export VPS_OPENCLAW_URL=http://192.168.1.100:3001
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
2. Test from your machine: `curl -X POST http://your-vps-ip:3001/agent/run -d '{"prompt":"test"}'`
3. Check VPS firewall allows access to port 3001
4. Ensure OpenClaw is running and accessible on the VPS
5. Check VPS OpenClaw logs for incoming requests

### OpenClaw VPS Setup
To run OpenClaw in HTTP mode on your VPS:
```bash
# Check if your OpenClaw version supports HTTP mode:
openclaw agent run --help

# If it supports HTTP:
openclaw agent run --http --port 3001 --host 0.0.0.0

# If not, you may need to:
# 1. Use SSH tunneling (see below)
# 2. Or check OpenClaw documentation for server mode
```

### SSH Tunnel Alternative (Most Secure)
Instead of exposing OpenClaw directly:
```bash
# On your development machine:
ssh -L 3001:localhost:3001 your_vps_user@your_vps_ip
# Keep this running - it forwards local port 3001 to VPS port 3001

# Then set:
export VPS_OPENCLAW_URL=http://localhost:3001
# Your backend will connect to localhost:3001, which goes through the tunnel to your VPS
```

## 📈 Roadmap

### ✅ Completed
- Core web interface (React/Vite + Monaco Editor + Terminal)
- Real OpenClaw integration (HTTP client to VPS)
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

# Configure your VPS connection (skip if OpenClaw runs locally)
export VPS_OPENCLAW_URL=http://your-vps-ip:3001

# Start developing!
npm run dev
# Then visit: http://localhost:5173
```

Happy coding with your AI-powered development assistant! 🐾