import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import io from 'socket.io-client';
import CmdKModal from './CmdKModal';
import './App.css';

const socket = io('http://localhost:5173'); // Note: Vite proxy or same port in prod

function App() {
  const [code, setCode] = useState('// Welcome to ClawIDE\n// Start coding or ask the agent!');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showCmdK, setShowCmdK] = useState(false);
  const [agentStatus, setAgentStatus] = useState('ready'); // ready, thinking, error
  const terminalRef = useRef(null);
  const editorRef = useRef(null);

  useEffect(() => {
    // Terminal setup
    if (terminalRef.current) {
      const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        theme: { background: '#1e1e1e', foreground: '#d4d4d4' }
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      fitAddon.fit();
      term.write('ClawIDE Terminal Ready\r\n$ ');

      // Handle terminal output from server
      socket.on('terminal-output', (data) => {
        term.write(data.output + '\r\n');
      });
    }

    // Agent status updates
    socket.on('agent-status', (data) => {
      setAgentStatus(data.status);
    });

    // Agent chat responses
    socket.on('agent-response', (data) => {
      setMessages(prev => [...prev, { role: 'agent', content: data.reply }]);
      setAgentStatus('ready');
    });

    // Handle disconnections
    socket.on('disconnect', () => {
      setAgentStatus('disconnected');
      setMessages(prev => [...prev, { 
        role: 'system', 
        content: 'Lost connection to agent server. Reconnecting...' 
      }]);
    });

    // Handle reconnections
    socket.on('reconnect', () => {
      setAgentStatus('reconnected');
      setMessages(prev => [...prev, { 
        role: 'system', 
        content: 'Reconnected to agent server.' 
      }]);
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
    };
  }, []);

  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    setAgentStatus('thinking');
    socket.emit('chat-message', { 
      message: input, 
      context: { 
        file: 'main.js', 
        content: code,
        // In future: include git status, file tree, etc.
      } 
    });
    setInput('');
  };

  const handleCmdKSubmit = (edits) => {
    // Apply the first edit suggestion to the code
    if (edits && edits.length > 0) {
      setCode(prev => {
        const edit = edits[0];
        // Simple replacement for MVP - improve with proper range handling later
        return edit.newText || prev;
      });
    }
    setShowCmdK(false);
    setAgentStatus('ready');
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="chat-header">
          <div className="agent-status-indicator">
            <span className={`status-dot ${agentStatus}`}></span>
            Claw Agent
          </div>
        </div>
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`message ${m.role}`}>
              <strong>{m.role === 'user' ? 'You' : m.role === 'agent' ? 'Claw' : 'System'}:</strong> 
              <span className="message-content">{m.content}</span>
            </div>
          ))}
        </div>
        <div className="chat-input">
          <input 
            value={input} 
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ask the agent..."
            disabled={agentStatus === 'disconnected'}
          />
          <button 
            onClick={sendMessage} 
            disabled={agentStatus === 'disconnected' || agentStatus === 'thinking'}
          >
            {agentStatus === 'thinking' ? 'Thinking...' : 'Send'}
          </button>
        </div>
        {agentStatus === 'disconnected' && (
          <div className="connection-error">
            ⚠️ Disconnected from agent server. Check your OpenClaw installation.
          </div>
        )}
      </div>
      
      <div className="main-area">
        <div className="editor-pane">
          <Editor
            ref={editorRef}
            height="60%"
            defaultLanguage="javascript"
            theme="vs-dark"
            value={code}
            onChange={(value) => setCode(value)}
          />
          <div className="terminal-pane" ref={terminalRef}></div>
        </div>
      </div>
      
      {/* Cmd+K Modal */}
      {showCmdK && (
        <CmdKModal 
          onClose={() => setShowCmdK(false)}
          content={code}
          fileName="main.js"
          onSuggestionSubmit={handleCmdKSubmit}
          agentStatus={agentStatus}
        />
      )}
    </div>
  );
}

export default App;
