require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const os = require('os');
const OpenClawClient = require('./openclaw-client');

let pty;
try { pty = require('node-pty'); } catch { pty = null; }

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

/* -- OpenClaw Gateway WS client -------------------------------- */

const VPS_URL = process.env.VPS_OPENCLAW_URL || 'http://localhost:18789';
const TOKEN   = process.env.OPENCLAW_GATEWAY_TOKEN || '';

const claw = new OpenClawClient({ url: VPS_URL, token: TOKEN });

claw.connect().then(() => {
  console.log('[OpenClaw] Connected to gateway at ' + VPS_URL);
}).catch((err) => {
  console.error('[OpenClaw] Initial connect failed: ' + err.message + ' - will auto-retry');
});

const sendToClaw = async (message, context, onDelta) => {
  const parts = [
    context?.file ? '[file: ' + context.file + ']' : null,
    context?.content ? '```\n' + context.content.slice(0, 4000) + '\n```' : null,
    context?.selection ? 'Selected:\n' + context.selection : null,
    message
  ].filter(Boolean).join('\n\n');

  try {
    const result = await claw.send(parts, { onDelta });
    return { reply: result.text || 'No response from agent.', codeEdits: [], terminalCommands: [] };
  } catch (err) {
    console.error('[OpenClaw] send error:', err.message);
    return { reply: 'Agent error: ' + err.message, codeEdits: [], terminalCommands: [] };
  }
};

/* -- Socket.IO connections ------------------------------------- */

io.on('connection', (socket) => {
  console.log('[Socket] Client connected:', socket.id);

  /* chat */
  socket.on('chat-message', async (data) => {
    console.log('[Socket] Chat from', socket.id);
    socket.emit('agent-status', { status: 'thinking' });

    const onDelta = (chunk) => socket.emit('agent-delta', { delta: chunk });

    try {
      const response = await sendToClaw(data.message, data.context, onDelta);
      socket.emit('agent-response', response);
      socket.emit('agent-status', { status: 'ready' });
    } catch (error) {
      console.error('[Socket] Error:', error);
      socket.emit('agent-response', { reply: 'Internal server error.', codeEdits: [], terminalCommands: [] });
      socket.emit('agent-status', { status: 'error' });
    }
  });

  /* cmd+k */
  socket.on('cmd-k-request', async (data) => {
    console.log('[Socket] Cmd+K from', socket.id);
    try {
      const response = await sendToClaw(data.prompt, {
        file: data.fileName,
        content: data.content,
        selection: data.selection
      });
      socket.emit('cmd-k-response', { reply: response.reply, edits: response.codeEdits });
    } catch (e) {
      socket.emit('cmd-k-response', { reply: '', edits: [] });
    }
  });

  /* terminal PTY */
  let term = null;
  const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/zsh');

  if (pty) {
    try {
      term = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME,
        env: process.env,
      });

      term.onData((data) => socket.emit('terminal-output', { output: data }));
      socket.on('terminal-input', (data) => term.write(data.input));
      socket.on('terminal-resize', (size) => {
        if (size.cols && size.rows) term.resize(size.cols, size.rows);
      });
    } catch (err) {
      console.warn('[PTY] node-pty failed:', err.message, '— falling back to child_process');
      term = null;
    }
  }

  // Fallback: use child_process when node-pty is unavailable
  if (!term) {
    const { spawn } = require('child_process');
    try {
      const proc = spawn(shell, ['-i'], {
        cwd: process.env.HOME,
        env: { ...process.env, TERM: 'xterm-256color' },
        stdio: ['pipe', 'pipe', 'pipe']
      });
      term = proc;
      proc.stdout.on('data', (data) => socket.emit('terminal-output', { output: data.toString() }));
      proc.stderr.on('data', (data) => socket.emit('terminal-output', { output: data.toString() }));
      socket.on('terminal-input', (data) => { try { proc.stdin.write(data.input); } catch {} });
      proc.on('exit', () => { socket.emit('terminal-output', { output: '\r\n[Process exited]\r\n' }); });
    } catch (err) {
      console.warn('[Terminal] Fallback spawn failed:', err.message);
      socket.emit('terminal-output', { output: '[Terminal unavailable]\r\n' });
    }
  }

  socket.on('disconnect', () => {
    console.log('[Socket] Disconnected:', socket.id);
    if (term) { try { term.kill(); } catch {} }
  });
});

/* -- health ---------------------------------------------------- */
app.get('/health', async (_req, res) => {
  try {
    const h = await claw.health();
    res.json({ server: 'ok', gateway: h });
  } catch (err) {
    res.status(503).json({ server: 'ok', gateway: 'unreachable', error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('ClawIDE Server on http://0.0.0.0:' + PORT);
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  claw.destroy();
  server.close(() => process.exit(0));
});
