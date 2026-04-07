import { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import io from 'socket.io-client';
import Markdown from 'react-markdown';
import {
  VscFiles, VscChevronRight, VscChevronDown, VscNewFile,
  VscNewFolder, VscFile, VscFolder, VscFolderOpened,
  VscSend, VscTerminal, VscComment, VscSettingsGear,
  VscRefresh, VscClose, VscSplitHorizontal
} from 'react-icons/vsc';
import CmdKModal from './CmdKModal';
import './App.css';

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
  reconnectionAttempts: 10,
});

/* ── helpers ─────────────────────────────────────────────────── */

const langFromFile = (name) => {
  const ext = name?.split('.').pop()?.toLowerCase();
  const map = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java',
    css: 'css', html: 'html', json: 'json', md: 'markdown', sh: 'shell',
    yml: 'yaml', yaml: 'yaml', sql: 'sql', c: 'c', cpp: 'cpp',
  };
  return map[ext] || 'plaintext';
};

/* ── App ─────────────────────────────────────────────────────── */

function App() {
  // Editor state
  const [tabs, setTabs] = useState([
    { name: 'welcome.js', content: '// Welcome to ClawIDE 🐾\n// Start coding or ask the Claw agent!\n\nfunction hello() {\n  console.log("Hello from ClawIDE");\n}\n' }
  ]);
  const [activeTab, setActiveTab] = useState(0);

  // Chat state
  const [messages, setMessages] = useState([
    { role: 'agent', content: 'Welcome to ClawIDE! I\'m your Claw agent. Ask me anything about your code, or use **Cmd+K** for inline edits.' }
  ]);
  const [input, setInput] = useState('');
  const [agentStatus, setAgentStatus] = useState('ready');
  const [streamingText, setStreamingText] = useState('');

  // UI state
  const [showCmdK, setShowCmdK] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('chat'); // 'chat' | 'files'
  const [fileTree, setFileTree] = useState(null);
  const [expandedDirs, setExpandedDirs] = useState(new Set());
  const [terminalReady, setTerminalReady] = useState(false);

  // Refs
  const terminalRef = useRef(null);
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const chatEndRef = useRef(null);
  const editorRef = useRef(null);
  const inputRef = useRef(null);

  /* ── terminal setup ───────────────────────────────────────── */

  useEffect(() => {
    if (!terminalRef.current || termRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
      lineHeight: 1.4,
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: '#264f78',
        black: '#0d1117',
        red: '#ff7b72',
        green: '#7ee787',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39d353',
        white: '#c9d1d9',
      }
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    termRef.current = term;
    fitAddonRef.current = fitAddon;
    setTerminalReady(true);

    // send keypresses to server PTY
    term.onData((data) => socket.emit('terminal-input', { input: data }));

    // receive PTY output
    socket.on('terminal-output', (data) => term.write(data.output));

    // resize
    const ro = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch {}
      if (term.cols && term.rows) {
        socket.emit('terminal-resize', { cols: term.cols, rows: term.rows });
      }
    });
    ro.observe(terminalRef.current);

    return () => {
      ro.disconnect();
      socket.off('terminal-output');
    };
  }, []);

  /* ── socket listeners ─────────────────────────────────────── */

  useEffect(() => {
    socket.on('agent-status', (data) => setAgentStatus(data.status));

    socket.on('agent-delta', (data) => {
      setStreamingText((prev) => prev + data.delta);
    });

    socket.on('agent-response', (data) => {
      setStreamingText('');
      setMessages((prev) => [...prev, { role: 'agent', content: data.reply }]);
      setAgentStatus('ready');
    });

    socket.on('disconnect', () => {
      setAgentStatus('disconnected');
    });

    socket.on('connect', () => {
      if (agentStatus === 'disconnected') setAgentStatus('ready');
    });

    return () => {
      socket.off('agent-status');
      socket.off('agent-delta');
      socket.off('agent-response');
      socket.off('disconnect');
      socket.off('connect');
    };
  }, []);

  /* ── auto-scroll chat ─────────────────────────────────────── */

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  /* ── keyboard shortcuts ───────────────────────────────────── */

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCmdK((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ── send message ─────────────────────────────────────────── */

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || agentStatus === 'thinking') return;
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setAgentStatus('thinking');
    setStreamingText('');

    const currentTab = tabs[activeTab];
    socket.emit('chat-message', {
      message: text,
      context: {
        file: currentTab?.name || 'untitled',
        content: currentTab?.content || '',
      }
    });
    setInput('');
  }, [input, agentStatus, tabs, activeTab]);

  /* ── tab management ───────────────────────────────────────── */

  const closeTab = (idx) => {
    if (tabs.length === 1) return;
    setTabs((prev) => prev.filter((_, i) => i !== idx));
    if (activeTab >= idx && activeTab > 0) setActiveTab(activeTab - 1);
  };

  const updateCode = (value) => {
    setTabs((prev) => prev.map((t, i) => i === activeTab ? { ...t, content: value } : t));
  };

  /* ── render ───────────────────────────────────────────────── */

  const currentFile = tabs[activeTab] || tabs[0];

  return (
    <div className="app-container">
      {/* Activity bar */}
      <div className="activity-bar">
        <button
          className={`activity-btn ${sidebarTab === 'files' ? 'active' : ''}`}
          onClick={() => setSidebarTab(sidebarTab === 'files' ? 'chat' : 'files')}
          title="Explorer"
        >
          <VscFiles size={22} />
        </button>
        <button
          className={`activity-btn ${sidebarTab === 'chat' ? 'active' : ''}`}
          onClick={() => setSidebarTab('chat')}
          title="Chat (⌘J)"
        >
          <VscComment size={22} />
          {agentStatus === 'thinking' && <span className="activity-badge" />}
        </button>
        <div className="activity-spacer" />
        <button className="activity-btn" title="Settings">
          <VscSettingsGear size={20} />
        </button>
      </div>

      {/* Sidebar */}
      <div className="sidebar">
        {sidebarTab === 'chat' ? (
          <>
            <div className="sidebar-header">
              <div className="sidebar-title">
                <span className={`status-dot ${agentStatus}`} />
                Claw Agent
              </div>
              <button
                className="icon-btn"
                onClick={() => setMessages([messages[0]])}
                title="New conversation"
              >
                <VscRefresh size={14} />
              </button>
            </div>

            <div className="chat-messages">
              {messages.map((m, i) => (
                <div key={i} className={`message ${m.role}`}>
                  <div className="message-avatar">
                    {m.role === 'user' ? '👤' : '🐾'}
                  </div>
                  <div className="message-body">
                    <Markdown>{m.content}</Markdown>
                  </div>
                </div>
              ))}
              {streamingText && (
                <div className="message agent">
                  <div className="message-avatar">🐾</div>
                  <div className="message-body streaming">
                    <Markdown>{streamingText}</Markdown>
                    <span className="cursor-blink">▊</span>
                  </div>
                </div>
              )}
              {agentStatus === 'thinking' && !streamingText && (
                <div className="message agent">
                  <div className="message-avatar">🐾</div>
                  <div className="message-body thinking-dots">
                    <span /><span /><span />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="chat-input-area">
              <div className="chat-input-wrapper">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Ask Claw anything… (⌘J to focus)"
                  rows={1}
                  disabled={agentStatus === 'disconnected'}
                />
                <button
                  className="send-btn"
                  onClick={sendMessage}
                  disabled={!input.trim() || agentStatus === 'thinking' || agentStatus === 'disconnected'}
                >
                  <VscSend size={16} />
                </button>
              </div>
              <div className="chat-shortcuts">
                <kbd>⌘K</kbd> inline edit
                <span className="sep">·</span>
                <kbd>⌘J</kbd> focus chat
                <span className="sep">·</span>
                <kbd>Shift+Enter</kbd> new line
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="sidebar-header">
              <div className="sidebar-title">
                <VscFiles size={14} /> Explorer
              </div>
            </div>
            <div className="file-tree">
              <div className="file-tree-placeholder">
                <VscFolder size={32} />
                <p>Open a folder to see files</p>
                <small>File tree integration coming soon</small>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Main area */}
      <div className="main-area">
        {/* Tab bar */}
        <div className="tab-bar">
          {tabs.map((tab, i) => (
            <div
              key={i}
              className={`tab ${i === activeTab ? 'active' : ''}`}
              onClick={() => setActiveTab(i)}
            >
              <VscFile size={14} />
              <span>{tab.name}</span>
              {tabs.length > 1 && (
                <button
                  className="tab-close"
                  onClick={(e) => { e.stopPropagation(); closeTab(i); }}
                >
                  <VscClose size={12} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Editor */}
        <div className="editor-pane">
          <Editor
            height="100%"
            language={langFromFile(currentFile?.name)}
            theme="vs-dark"
            value={currentFile?.content || ''}
            onChange={updateCode}
            onMount={(editor) => { editorRef.current = editor; }}
            options={{
              fontSize: 14,
              fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
              fontLigatures: true,
              minimap: { enabled: false },
              padding: { top: 12 },
              lineNumbers: 'on',
              renderLineHighlight: 'gutter',
              scrollBeyondLastLine: false,
              bracketPairColorization: { enabled: true },
              cursorBlinking: 'smooth',
              smoothScrolling: true,
              wordWrap: 'on',
            }}
          />
        </div>

        {/* Terminal */}
        <div className="terminal-section">
          <div className="terminal-header">
            <VscTerminal size={14} />
            <span>Terminal</span>
          </div>
          <div className="terminal-pane" ref={terminalRef} />
        </div>
      </div>

      {/* Cmd+K overlay */}
      {showCmdK && (
        <CmdKModal
          onClose={() => setShowCmdK(false)}
          content={currentFile?.content || ''}
          fileName={currentFile?.name || 'untitled'}
          onSuggestionSubmit={(edits) => {
            if (edits?.[0]?.newText) updateCode(edits[0].newText);
            setShowCmdK(false);
          }}
          agentStatus={agentStatus}
        />
      )}

      {/* Status bar */}
      <div className="status-bar">
        <div className="status-left">
          <span className={`status-indicator ${claw_status()}`} />
          <span>{statusText()}</span>
        </div>
        <div className="status-right">
          <span>{langFromFile(currentFile?.name)}</span>
          <span>ClawIDE v1.0</span>
        </div>
      </div>
    </div>
  );

  function claw_status() { return agentStatus; }
  function statusText() {
    switch (agentStatus) {
      case 'ready': return 'Claw Ready';
      case 'thinking': return 'Claw Thinking…';
      case 'disconnected': return 'Disconnected';
      case 'error': return 'Error';
      default: return '';
    }
  }
}

export default App;
