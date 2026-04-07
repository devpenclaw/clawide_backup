const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const { promisify } = require('util');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Helper to spawn OpenClaw with timeout
const spawnOpenClaw = async (prompt, context) => {
  return new Promise((resolve, reject) => {
    // Prepare context for OpenClaw
    const contextStr = JSON.stringify({
      ...context,
      timestamp: new Date().toISOString(),
      workspace: process.cwd()
    });

    // Spawn OpenClaw agent process
    const openclaw = spawn('openclaw', [
      'agent',
      'run',
      '--prompt', prompt,
      '--context', contextStr,
      '--format', 'json'
    ], {
      // Use pipes for stdio control
      stdio: ['pipe', 'pipe', 'pipe'],
      // Windows compatibility
      windowsHide: true
    });

    let stdoutData = '';
    let stderrData = '';

    // Collect stdout
    openclaw.stdout.on('data', (data) => {
      stdoutData += data.toString('utf8');
    });

    // Collect stderr
    openclaw.stderr.on('data', (data) => {
      stderrData += data.toString('utf8');
      // Log but don't fail - OpenClaw may write debug info to stderr
      console.debug('[OpenClaw stderr]', data.toString('utf8'));
    });

    // Handle process completion
    openclaw.on('close', (code) => {
      if (code !== 0) {
        console.warn(`[OpenClaw] Process exited with code ${code}`);
        console.warn(`[OpenClaw] Stderr: ${stderrData}`);
        // Don't reject - try to parse what we got
      }

      try {
        // Clean and parse JSON response
        const cleanOutput = stdoutData.trim();
        if (!cleanOutput) {
          throw new Error('Empty response from OpenClaw');
        }

        const response = JSON.parse(cleanOutput);
        
        // Validate response structure
        resolve({
          reply: response.reply || "I've processed your request.",
          codeEdits: Array.isArray(response.codeEdits) ? response.codeEdits : [],
          terminalCommands: Array.isArray(response.terminalCommands) ? response.terminalCommands : []
        });
      } catch (parseError) {
        console.error('[OpenClaw] JSON Parse Error:', parseError);
        console.error('[OpenClaw] Raw stdout:', stdoutData);
        console.error('[OpenClaw] Raw stderr:', stderrData);
        
        // Fallback to helpful error message
        resolve({
          reply: `I encountered an issue processing your request. The OpenClaw agent returned invalid data. Please check your OpenClaw installation and try again. Error: ${parseError.message}`,
          codeEdits: [],
          terminalCommands: []
        });
      }
    });

    // Handle process errors
    openclaw.on('error', (err) => {
      console.error('[OpenClaw] Process Error:', err);
      resolve({
        reply: `Failed to start OpenClaw agent: ${err.message}\n\nPlease ensure:\n1. OpenClaw is installed globally (npm install -g openclaw)\n2. You're logged into your OpenClaw instance\n3. The 'openclaw' command is available in your PATH`,
        codeEdits: [],
        terminalCommands: []
      });
    });

    // Timeout after 45 seconds (OpenClaw might need time for complex reasoning)
    setTimeout(() => {
      if (!openclaw.killed) {
        openclaw.kill();
        resolve({
          reply: `OpenClaw request timed out after 45 seconds. The agent may be working on a complex problem. Try:\n1. Simplifying your request\n2. Checking your OpenClaw connection\n3. Trying again in a moment`,
          codeEdits: [],
          terminalCommands: []
        });
      }
    }, 45000);
  });
};

io.on('connection', (socket) => {
  console.log('[Socket] Client connected:', socket.id);

  // Handle chat messages
  socket.on('chat-message', async (data) => {
    console.log('[Socket] Chat message from', socket.id, ':', data.message.substring(0, 50) + '...');
    
    // Send typing indicator
    socket.emit('agent-status', { status: 'thinking' });
    
    try {
      const response = await spawnOpenClaw(data.message, data.context);
      socket.emit('agent-response', response);
      socket.emit('agent-status', { status: 'ready' });
    } catch (error) {
      console.error('[Socket] Chat message error:', error);
      socket.emit('agent-response', {
        reply: `I encountered an internal error while processing your request. Please try again.`,
        codeEdits: [],
        terminalCommands: []
      });
      socket.emit('agent-status', { status: 'error' });
    }
  });

  // Handle Cmd+K requests
  socket.on('cmd-k-request', async (data) => {
    console.log('[Socket] Cmd+K request from', socket.id, ':', data.prompt.substring(0, 30) + '...');
    
    try {
      const response = await spawnOpenClaw(data.prompt, { 
        file: data.fileName, 
        content: data.content,
        selection: data.selection || null
      });
      socket.emit('cmd-k-response', { edits: response.codeEdits });
    } catch (error) {
      console.error('[Socket] Cmd+K error:', error);
      socket.emit('cmd-k-response', { edits: [] });
    }
  });

  // Handle terminal execution requests (secure)
  socket.on('terminal-execute', async (data) => {
    console.log('[Socket] Terminal execute request:', data.command);
    
    // SECURITY: Only allow certain safe commands in MVP
    const SAFE_COMMANDS = [
      'ls', 'pwd', 'cd', 'mkdir', 'touch', 'echo', 'cat', 
      'git', 'npm', 'node', 'python', 'pip', 'openclaw'
    ];
    
    const cmdParts = data.command.trim().split(/\s+/);
    const baseCmd = cmdParts[0];
    
    if (!SAFE_COMMANDS.includes(baseCmd)) {
      socket.emit('terminal-output', {
        output: `Error: Command '${baseCmd}' is not allowed for security reasons.\nAllowed commands: ${SAFE_COMMANDS.join(', ')}\n$ `,
        command: data.command
      });
      return;
    }

    // Execute via node-pty would go here in production
    // For MVP, we'll simulate with child_process (still with restrictions)
    const { execFile } = require('child_process');
    
    execFile(baseCmd, cmdParts.slice(1), { 
      timeout: 10000,
      maxBuffer: 1024 * 1024 // 1MB
    }, (error, stdout, stderr) => {
      let output = `$ ${data.command}\n`;
      
      if (error) {
        output += `Error: ${error.message}\n`;
        if (stderr) output += stderr;
      } else {
        if (stdout) output += stdout;
        if (stderr) output += stderr;
      }
      
      output += '$ ';
      socket.emit('terminal-output', { 
        output: output.trimEnd(),
        command: data.command 
      });
    });
  });

  // Handle disconnections
  socket.on('disconnect', (reason) => {
    console.log('[Socket] Client disconnected:', socket.id, 'reason:', reason);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 ClawIDE Server running on http://localhost:${PORT}`);
  console.log(`📌 Make sure OpenClaw is installed: npm install -g openclaw`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});
