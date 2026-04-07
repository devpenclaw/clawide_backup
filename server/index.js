const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Frontend dev server
    methods: ["GET", "POST"]
  }
});

// OpenClaw HTTP Client (connects to VPS)
const spawnOpenClaw = async (prompt, context) => {
  // IMPORTANT: Replace this with your actual VPS IP or domain
  const VPS_OPENCLAW_URL = process.env.VPS_OPENCLAW_URL || 'http://YOUR_VPS_IP:3001';
  
  try {
    const response = await axios.post(
      `${VPS_OPENCLAW_URL}/agent/run`,
      {
        prompt: prompt,
        context: {
          ...context,
          timestamp: new Date().toISOString(),
          workspace: process.cwd()
        }
      },
      {
        timeout: 15000, // 15 second timeout for potentially complex reasoning
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    return {
      reply: response.data.reply || "I've processed your request.",
      codeEdits: Array.isArray(response.data.codeEdits) ? response.data.codeEdits : [],
      terminalCommands: Array.isArray(response.data.terminalCommands) ? response.data.terminalCommands : []
    };
  } catch (error) {
    console.error('[OpenClaw HTTP] Error:', error.message);
    // Provide helpful error message for user
    return {
      reply: `I couldn't reach the OpenClaw agent on your VPS. Please check:\n\n1. OpenClaw is running on your VPS\n2. The VPS is accessible from this machine\n3. Port 3001 is open on your VPS firewall\n4. The VPS_OPENCLAW_URL environment variable is set correctly\n\nCurrent target: ${VPS_OPENCLAW_URL}\nError: ${error.message}`,
      codeEdits: [],
      terminalCommands: []
    };
  }
};

io.on('connection', (socket) => {
  console.log('[Socket] Client connected:', socket.id);

  socket.on('chat-message', async (data) => {
    console.log('[Socket] Chat message from', socket.id);
    
    // Emit typing indicator
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

  socket.on('cmd-k-request', async (data) => {
    console.log('[Socket] Cmd+K request from', socket.id);
    
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

  // Handle disconnections
  socket.on('disconnect', (reason) => {
    console.log('[Socket] Client disconnected:', socket.id, 'reason:', reason);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 ClawIDE Server running on http://0.0.0.0:${PORT}`);
  console.log(`📌 Make sure to set VPS_OPENCLAW_URL environment variable`);
  console.log(`📌 Example: export VPS_OPENCLAW_URL=http://your-vps-ip:3001`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});
