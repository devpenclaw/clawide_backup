import { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import io from 'socket.io-client';
import Markdown from 'react-markdown';
import {
  VscFiles, VscSearch, VscComment, VscSettingsGear,
  VscTerminal, VscClose, VscAdd, VscFile, VscFolder,
  VscFolderOpened, VscNewFile, VscNewFolder, VscRefresh,
  VscSend, VscChevronRight, VscChevronDown, VscChevronUp,
  VscDebugStart, VscCopy, VscWand, VscMic, VscSplitHorizontal,
} from 'react-icons/vsc';
import CmdKModal from './CmdKModal';
import './App.css';

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
  reconnectionAttempts: 10,
});

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

const FILE_ICON_COLORS = {
  js: '#f7df1e', jsx: '#61dafb', ts: '#3178c6', tsx: '#3178c6',
  py: '#3776ab', css: '#1572b6', html: '#e34f26', json: '#8bc34a',
  md: '#083fa1', yml: '#cb171e', yaml: '#cb171e', sh: '#89e051',
  go: '#00add8', rs: '#dea584', rb: '#cc342d', java: '#f89820',
};

function App() {
  /* ═══ State ═══ */

  // Layout
  const [showExplorer, setShowExplorer] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [activePanel, setActivePanel] = useState('explorer');

  // Workspaces
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspace] = useState(0);

  // Editor
  const [tabs, setTabs] = useState([
    {
      name: 'welcome.js', path: null, modified: false,
      content: '// Welcome to ClawIDE 🐾\n// Start coding or chat with the AI agent!\n\nfunction hello() {\n  console.log("Hello from ClawIDE");\n}\n',
    }
  ]);
  const [activeTab, setActiveTab] = useState(0);

  // Chat
  const [chatSessions, setChatSessions] = useState([{
    id: 1, name: 'New Chat',
    messages: [{ role: 'agent', content: "Welcome to **ClawIDE**! I'm your AI coding assistant. Ask me anything about your code, or press **⌘K** for inline edits." }],
  }]);
  const [activeChatSession, setActiveChatSession] = useState(0);
  const [input, setInput] = useState('');
  const [agentStatus, setAgentStatus] = useState('ready');
  const [streamingText, setStreamingText] = useState('');

  // File tree
  const [fileTree, setFileTree] = useState({});
  const [expandedDirs, setExpandedDirs] = useState(new Set());
  const [rootPath, setRootPath] = useState(null);

  // Terminal
  const [terminalTabs] = useState([{ id: 1, name: 'zsh' }]);
  const [activeTerminalTab] = useState(0);

  // Voice
  const [isRecording, setIsRecording] = useState(false);

  // Settings
  const [settings, setSettings] = useState({
    fontSize: 14, tabSize: 2, wordWrap: 'on', minimap: false,
    lineNumbers: 'on', bracketPairs: true, fontLigatures: true,
  });

  // CmdK
  const [showCmdK, setShowCmdK] = useState(false);

  // Refs
  const terminalRef = useRef(null);
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const chatEndRef = useRef(null);
  const editorRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const currentSession = chatSessions[activeChatSession];
  const messages = currentSession?.messages || [];
  const currentFile = tabs[activeTab] || tabs[0];

  /* ═══ File System ═══ */

  const loadDirectory = useCallback((dirPath) => {
    socket.emit('fs-list', { dirPath }, (res) => {
      if (res?.ok) setFileTree(prev => ({ ...prev, [dirPath]: res.items }));
    });
  }, []);

  const openFile = useCallback((filePath, fileName) => {
    const idx = tabsRef.current.findIndex(t => t.path === filePath);
    if (idx !== -1) { setActiveTab(idx); return; }
    socket.emit('fs-read', { filePath }, (res) => {
      if (res?.ok) {
        setTabs(prev => {
          const i = prev.findIndex(t => t.path === filePath);
          if (i !== -1) { setActiveTab(i); return prev; }
          setActiveTab(prev.length);
          return [...prev, { name: fileName, path: filePath, content: res.content, modified: false }];
        });
      }
    });
  }, []);

  const saveFile = useCallback(() => {
    const tab = tabsRef.current[activeTab];
    if (!tab?.path) return;
    socket.emit('fs-write', { filePath: tab.path, content: tab.content }, (res) => {
      if (res?.ok) setTabs(prev => prev.map((t, i) => i === activeTab ? { ...t, modified: false } : t));
    });
  }, [activeTab]);

  const createNewFile = useCallback((dirPath) => {
    const name = prompt('New file name:');
    if (!name?.trim()) return;
    socket.emit('fs-create-file', { dirPath, name: name.trim() }, (res) => {
      if (res?.ok) { loadDirectory(dirPath); openFile(res.path, name.trim()); }
    });
  }, [loadDirectory, openFile]);

  const createNewFolder = useCallback((dirPath) => {
    const name = prompt('New folder name:');
    if (!name?.trim()) return;
    socket.emit('fs-create-dir', { dirPath, name: name.trim() }, (res) => {
      if (res?.ok) loadDirectory(dirPath);
    });
  }, [loadDirectory]);

  // Init workspace
  useEffect(() => {
    socket.emit('fs-home', {}, (res) => {
      if (res?.ok) {
        setRootPath(res.path);
        loadDirectory(res.path);
        setWorkspaces([{ id: 1, name: res.name || 'Home', path: res.path }]);
      }
    });
  }, [loadDirectory]);

  /* ═══ Terminal ═══ */

  useEffect(() => {
    if (!terminalRef.current || termRef.current) return;
    const term = new Terminal({
      cursorBlink: true, cursorStyle: 'bar', fontSize: 13,
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, monospace",
      lineHeight: 1.5, allowProposedApi: true,
      theme: {
        background: '#0c0c0f', foreground: '#e4e4e7',
        cursor: '#8b5cf6', cursorAccent: '#0c0c0f',
        selectionBackground: 'rgba(139, 92, 246, 0.25)',
        black: '#18181b', red: '#f87171', green: '#4ade80',
        yellow: '#facc15', blue: '#60a5fa', magenta: '#c084fc',
        cyan: '#22d3ee', white: '#e4e4e7',
        brightBlack: '#52525b', brightRed: '#fca5a5', brightGreen: '#86efac',
        brightYellow: '#fde047', brightBlue: '#93c5fd', brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9', brightWhite: '#fafafa',
      }
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    setTimeout(() => { try { fitAddon.fit(); } catch {} }, 100);
    termRef.current = term;
    fitAddonRef.current = fitAddon;
    term.onData((data) => socket.emit('terminal-input', { input: data }));
    socket.on('terminal-output', (data) => term.write(data.output));
    const ro = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch {}
      if (term.cols && term.rows) socket.emit('terminal-resize', { cols: term.cols, rows: term.rows });
    });
    ro.observe(terminalRef.current);
    return () => { ro.disconnect(); socket.off('terminal-output'); };
  }, []);

  // Refit terminal when shown
  useEffect(() => {
    if (showTerminal && fitAddonRef.current) {
      setTimeout(() => { try { fitAddonRef.current.fit(); } catch {} }, 50);
    }
  }, [showTerminal]);

  /* ═══ Socket listeners ═══ */

  useEffect(() => {
    const onStatus = (d) => setAgentStatus(d.status);
    const onDelta = (d) => setStreamingText(prev => prev + d.delta);
    const onResponse = (d) => {
      setStreamingText('');
      setChatSessions(prev => prev.map((s, i) =>
        i === activeChatSession
          ? { ...s, messages: [...s.messages, { role: 'agent', content: d.reply }] }
          : s
      ));
      setAgentStatus('ready');
    };
    const onDisconnect = () => setAgentStatus('disconnected');
    const onConnect = () => setAgentStatus(prev => prev === 'disconnected' ? 'ready' : prev);

    socket.on('agent-status', onStatus);
    socket.on('agent-delta', onDelta);
    socket.on('agent-response', onResponse);
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);
    return () => {
      socket.off('agent-status', onStatus);
      socket.off('agent-delta', onDelta);
      socket.off('agent-response', onResponse);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
    };
  }, [activeChatSession]);

  /* ═══ Auto-scroll chat ═══ */
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingText]);

  /* ═══ Keyboard shortcuts ═══ */
  useEffect(() => {
    const handler = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'k') { e.preventDefault(); setShowCmdK(v => !v); }
      if (mod && e.key === 'j') { e.preventDefault(); setShowChat(true); setTimeout(() => inputRef.current?.focus(), 50); }
      if (mod && e.key === 's') { e.preventDefault(); saveFile(); }
      if (mod && e.key === 'b') { e.preventDefault(); setShowExplorer(v => !v); }
      if (mod && e.key === '`') { e.preventDefault(); setShowTerminal(v => !v); }
      if (mod && e.shiftKey && (e.key === 'V' || e.key === 'v')) { e.preventDefault(); toggleVoice(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveFile]);

  /* ═══ Send message ═══ */
  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || agentStatus === 'thinking') return;
    setChatSessions(prev => prev.map((s, i) =>
      i === activeChatSession
        ? { ...s, messages: [...s.messages, { role: 'user', content: text }] }
        : s
    ));
    setAgentStatus('thinking');
    setStreamingText('');
    const curTab = tabsRef.current[activeTab];
    socket.emit('chat-message', {
      message: text,
      context: { file: curTab?.name || 'untitled', content: curTab?.content || '' },
    });
    setInput('');
  }, [input, agentStatus, activeTab, activeChatSession]);

  /* ═══ Voice ═══ */
  const toggleVoice = useCallback(() => {
    if (isRecording) { recognitionRef.current?.stop(); setIsRecording(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recog = new SR();
    recog.continuous = true; recog.interimResults = true; recog.lang = 'en-US';
    recog.onresult = (ev) => {
      let t = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      setInput(t);
    };
    recog.onend = () => setIsRecording(false);
    recog.onerror = () => setIsRecording(false);
    recog.start();
    recognitionRef.current = recog;
    setIsRecording(true);
  }, [isRecording]);

  /* ═══ Tab management ═══ */
  const closeTab = (idx) => {
    if (tabs.length <= 1) return;
    setTabs(prev => prev.filter((_, i) => i !== idx));
    if (activeTab >= idx && activeTab > 0) setActiveTab(prev => prev - 1);
  };

  const updateCode = useCallback((value) => {
    setTabs(prev => prev.map((t, i) => i === activeTab ? { ...t, content: value, modified: true } : t));
  }, [activeTab]);

  /* ═══ Workspace ═══ */
  const addWorkspace = () => {
    const name = prompt('Workspace name:');
    if (!name) return;
    const wsPath = prompt('Absolute path:');
    if (!wsPath) return;
    setWorkspaces(prev => [...prev, { id: Date.now(), name, path: wsPath }]);
    setActiveWorkspace(workspaces.length);
    setRootPath(wsPath);
    loadDirectory(wsPath);
  };

  const switchWorkspace = (i) => {
    setActiveWorkspace(i);
    setRootPath(workspaces[i].path);
    loadDirectory(workspaces[i].path);
  };

  /* ═══ Chat sessions ═══ */
  const newChatSession = () => {
    const id = Date.now();
    setChatSessions(prev => [...prev, {
      id, name: `Chat ${prev.length + 1}`,
      messages: [{ role: 'agent', content: 'New conversation started. How can I help?' }],
    }]);
    setActiveChatSession(chatSessions.length);
  };

  const statusText = () => {
    if (agentStatus === 'ready') return 'AI Ready';
    if (agentStatus === 'thinking') return 'Processing…';
    if (agentStatus === 'disconnected') return 'Disconnected';
    if (agentStatus === 'error') return 'Error';
    return '';
  };

  /* ═══ FileTreeItem ═══ */
  const FileTreeItem = ({ item, depth = 0 }) => {
    const isDir = item.type === 'directory';
    const isExpanded = expandedDirs.has(item.path);
    const children = fileTree[item.path] || [];
    const ext = item.name.split('.').pop()?.toLowerCase();
    const iconColor = FILE_ICON_COLORS[ext] || '#71717a';

    const handleClick = () => {
      if (!isDir) { openFile(item.path, item.name); return; }
      setExpandedDirs(prev => {
        const next = new Set(prev);
        if (next.has(item.path)) next.delete(item.path);
        else { next.add(item.path); if (!fileTree[item.path]) loadDirectory(item.path); }
        return next;
      });
    };

    return (
      <>
        <div
          className={`tree-item${!isDir ? ' tree-file' : ''}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={handleClick}
        >
          {isDir
            ? (isExpanded ? <VscChevronDown size={12} className="tree-chevron" /> : <VscChevronRight size={12} className="tree-chevron" />)
            : <span className="tree-spacer" />}
          {isDir
            ? (isExpanded ? <VscFolderOpened size={16} className="tree-icon dir" /> : <VscFolder size={16} className="tree-icon dir" />)
            : <VscFile size={16} className="tree-icon" style={{ color: iconColor }} />}
          <span className="tree-name">{item.name}</span>
        </div>
        {isDir && isExpanded && children.map(child => (
          <FileTreeItem key={child.path} item={child} depth={depth + 1} />
        ))}
      </>
    );
  };

  /* ═══════════════ RENDER ═══════════════ */

  return (
    <div className="ide-root">

      {/* ─── Title Bar ─── */}
      <header className="title-bar">
        <div className="title-brand">
          <span className="brand-icon">🐾</span>
          <span className="brand-name">ClawIDE</span>
        </div>
        <div className="workspace-tabs">
          {workspaces.map((ws, i) => (
            <button key={ws.id} className={`ws-tab${i === activeWorkspace ? ' active' : ''}`} onClick={() => switchWorkspace(i)}>
              <VscFolder size={12} /> {ws.name}
            </button>
          ))}
          <button className="ws-tab ws-add" onClick={addWorkspace} title="New Codespace">
            <VscAdd size={14} />
          </button>
        </div>
        <div className="title-right">
          <button className={`title-btn${isRecording ? ' recording' : ''}`} onClick={toggleVoice} title="Voice (⌘⇧V)">
            <VscMic size={16} />
          </button>
        </div>
      </header>

      {/* ─── Body ─── */}
      <div className="ide-body">

        {/* Activity Bar */}
        <nav className="activity-bar">
          <div className="ab-top">
            <button className={`ab-btn${showExplorer && activePanel === 'explorer' ? ' active' : ''}`}
              onClick={() => { if (showExplorer && activePanel === 'explorer') setShowExplorer(false); else { setShowExplorer(true); setActivePanel('explorer'); } }}
              title="Explorer (⌘B)"><VscFiles size={22} /></button>
            <button className={`ab-btn${showExplorer && activePanel === 'search' ? ' active' : ''}`}
              onClick={() => { if (showExplorer && activePanel === 'search') setShowExplorer(false); else { setShowExplorer(true); setActivePanel('search'); } }}
              title="Search"><VscSearch size={22} /></button>
            <button className={`ab-btn${showExplorer && activePanel === 'buildplan' ? ' active' : ''}`}
              onClick={() => { if (showExplorer && activePanel === 'buildplan') setShowExplorer(false); else { setShowExplorer(true); setActivePanel('buildplan'); } }}
              title="Build Plan"><VscDebugStart size={22} /></button>
          </div>
          <div className="ab-bottom">
            <button className={`ab-btn${showChat ? ' active' : ''}`} onClick={() => setShowChat(v => !v)} title="AI Chat (⌘J)">
              <VscComment size={22} />
              {agentStatus === 'thinking' && <span className="ab-badge" />}
            </button>
            <button className={`ab-btn${showSettings ? ' active' : ''}`} onClick={() => setShowSettings(v => !v)} title="Settings">
              <VscSettingsGear size={20} />
            </button>
          </div>
        </nav>

        {/* ─── Left Sidebar ─── */}
        {showExplorer && (
          <aside className="left-sidebar">
            {activePanel === 'explorer' && (
              <>
                <div className="panel-hdr">
                  <span className="panel-title">EXPLORER</span>
                  <div className="panel-actions">
                    <button className="i-btn" onClick={() => rootPath && createNewFile(rootPath)} title="New File"><VscNewFile size={14} /></button>
                    <button className="i-btn" onClick={() => rootPath && createNewFolder(rootPath)} title="New Folder"><VscNewFolder size={14} /></button>
                    <button className="i-btn" onClick={() => rootPath && loadDirectory(rootPath)} title="Refresh"><VscRefresh size={14} /></button>
                  </div>
                </div>
                <div className="file-tree">
                  {rootPath && fileTree[rootPath]
                    ? fileTree[rootPath].map(item => <FileTreeItem key={item.path} item={item} />)
                    : <div className="panel-empty"><VscFolder size={28} /><p>Loading workspace…</p></div>}
                </div>
              </>
            )}
            {activePanel === 'search' && (
              <>
                <div className="panel-hdr"><span className="panel-title">SEARCH</span></div>
                <div className="search-panel">
                  <input className="search-input" placeholder="Search files…" type="text" />
                  <p className="search-hint">Search across your project files</p>
                </div>
              </>
            )}
            {activePanel === 'buildplan' && (
              <>
                <div className="panel-hdr"><span className="panel-title">BUILD PLAN</span></div>
                <div className="build-panel">
                  <div className="build-card">
                    <VscWand size={18} className="build-icon" />
                    <h4>Generate Build Plan</h4>
                    <p>Analyze project dependencies, testing strategy, and CI/CD pipeline.</p>
                    <button className="build-btn" onClick={() => {
                      setShowChat(true);
                      setInput('Analyze this project and generate a comprehensive build plan including: dependencies, testing strategy, CI/CD pipeline, and deployment steps.');
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}>Generate Plan</button>
                  </div>
                  <div className="build-card">
                    <VscDebugStart size={18} className="build-icon" />
                    <h4>Test Plan</h4>
                    <p>Auto-generate testing plans and unit test suggestions.</p>
                    <button className="build-btn" onClick={() => {
                      setShowChat(true);
                      setInput('Generate a comprehensive testing plan for this project with unit test suggestions for key modules.');
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}>Generate Tests</button>
                  </div>
                </div>
              </>
            )}
          </aside>
        )}

        {/* ─── Center: Editor + Terminal ─── */}
        <main className="center-area">
          {/* Tab bar */}
          <div className="tab-bar">
            <div className="tab-list">
              {tabs.map((tab, i) => (
                <button key={i} className={`tab${i === activeTab ? ' active' : ''}`} onClick={() => setActiveTab(i)}>
                  <VscFile size={14} style={{ color: FILE_ICON_COLORS[tab.name.split('.').pop()?.toLowerCase()] || '#71717a' }} />
                  <span className="tab-name">{tab.name}</span>
                  {tab.modified && <span className="tab-dot" />}
                  {tabs.length > 1 && (
                    <span className="tab-x" onClick={(e) => { e.stopPropagation(); closeTab(i); }}>
                      <VscClose size={12} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Editor */}
          <div className="editor-wrap">
            <Editor
              height="100%"
              language={langFromFile(currentFile?.name)}
              theme="vs-dark"
              value={currentFile?.content || ''}
              onChange={updateCode}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                monaco.editor.defineTheme('claw-dark', {
                  base: 'vs-dark', inherit: true,
                  rules: [
                    { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
                    { token: 'keyword', foreground: 'c084fc' },
                    { token: 'string', foreground: '86efac' },
                    { token: 'number', foreground: 'fbbf24' },
                    { token: 'type', foreground: '67e8f9' },
                  ],
                  colors: {
                    'editor.background': '#0c0c0f',
                    'editor.foreground': '#e4e4e7',
                    'editor.lineHighlightBackground': '#15151a',
                    'editor.selectionBackground': '#8b5cf633',
                    'editorCursor.foreground': '#8b5cf6',
                    'editorLineNumber.foreground': '#3f3f46',
                    'editorLineNumber.activeForeground': '#71717a',
                    'editorIndentGuide.background1': '#27272a',
                    'editor.selectionHighlightBackground': '#8b5cf622',
                  }
                });
                monaco.editor.setTheme('claw-dark');
              }}
              options={{
                fontSize: settings.fontSize, tabSize: settings.tabSize,
                fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
                fontLigatures: settings.fontLigatures, minimap: { enabled: settings.minimap },
                padding: { top: 16, bottom: 16 }, lineNumbers: settings.lineNumbers,
                renderLineHighlight: 'gutter', scrollBeyondLastLine: false,
                bracketPairColorization: { enabled: settings.bracketPairs },
                cursorBlinking: 'smooth', cursorStyle: 'line', cursorWidth: 2,
                smoothScrolling: true, wordWrap: settings.wordWrap,
                folding: true, glyphMargin: false, automaticLayout: true,
                scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
              }}
            />
          </div>

          {/* Terminal (always mounted, conditionally visible) */}
          <div className={`term-section${showTerminal ? '' : ' collapsed'}`}>
            <div className="term-hdr">
              <div className="term-tabs">
                {terminalTabs.map((t, i) => (
                  <button key={t.id} className={`term-tab${i === activeTerminalTab ? ' active' : ''}`}>
                    <VscTerminal size={12} /> {t.name}
                  </button>
                ))}
                <button className="term-tab term-add" title="New Terminal"><VscAdd size={12} /></button>
              </div>
              <div className="term-actions">
                <button className="i-btn" title="Split"><VscSplitHorizontal size={14} /></button>
                <button className="i-btn" onClick={() => setShowTerminal(false)} title="Close"><VscClose size={14} /></button>
              </div>
            </div>
            <div className="term-body" ref={terminalRef} />
          </div>

          {/* Terminal toggle bar */}
          {!showTerminal && (
            <button className="term-toggle" onClick={() => setShowTerminal(true)}>
              <VscTerminal size={14} /> <span>Terminal</span> <VscChevronUp size={12} />
            </button>
          )}
        </main>

        {/* ─── Right Panel: Chat ─── */}
        {showChat && (
          <aside className="right-panel">
            <div className="chat-hdr">
              <div className="chat-hdr-left">
                <span className={`dot ${agentStatus}`} />
                <span className="chat-hdr-title">AI Assistant</span>
              </div>
              <div className="chat-hdr-actions">
                <button className="i-btn" onClick={newChatSession} title="New Chat"><VscAdd size={14} /></button>
                <button className="i-btn" onClick={() => setShowChat(false)} title="Close"><VscClose size={14} /></button>
              </div>
            </div>

            {chatSessions.length > 1 && (
              <div className="chat-sessions">
                {chatSessions.map((s, i) => (
                  <button key={s.id} className={`cs-tab${i === activeChatSession ? ' active' : ''}`} onClick={() => setActiveChatSession(i)}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}

            <div className="chat-msgs">
              {messages.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  <div className="msg-avatar">
                    {m.role === 'user'
                      ? <div className="avatar-circle user">U</div>
                      : <div className="avatar-circle agent">🐾</div>}
                  </div>
                  <div className="msg-content">
                    <span className="msg-sender">{m.role === 'user' ? 'You' : 'Claw'}</span>
                    <div className="msg-body"><Markdown>{m.content}</Markdown></div>
                    {m.role === 'agent' && (
                      <div className="msg-actions">
                        <button className="msg-act" title="Copy" onClick={() => navigator.clipboard.writeText(m.content)}><VscCopy size={12} /> Copy</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {streamingText && (
                <div className="msg agent">
                  <div className="msg-avatar"><div className="avatar-circle agent">🐾</div></div>
                  <div className="msg-content">
                    <span className="msg-sender">Claw</span>
                    <div className="msg-body streaming"><Markdown>{streamingText}</Markdown><span className="stream-cursor" /></div>
                  </div>
                </div>
              )}
              {agentStatus === 'thinking' && !streamingText && (
                <div className="msg agent">
                  <div className="msg-avatar"><div className="avatar-circle agent glow">🐾</div></div>
                  <div className="msg-content">
                    <div className="thinking"><span /><span /><span /></div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="chat-input-area">
              <div className="chat-box">
                <textarea
                  ref={inputRef} value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Ask anything… (⌘J)"
                  rows={1} disabled={agentStatus === 'disconnected'}
                />
                <div className="chat-btns">
                  <button className={`voice-btn${isRecording ? ' on' : ''}`} onClick={toggleVoice} title="Voice (⌘⇧V)"><VscMic size={16} /></button>
                  <button className="send-btn" onClick={sendMessage}
                    disabled={!input.trim() || agentStatus === 'thinking' || agentStatus === 'disconnected'}>
                    <VscSend size={16} />
                  </button>
                </div>
              </div>
              <div className="chat-hints">
                <kbd>⌘K</kbd> inline edit <span className="sep">·</span>
                <kbd>⇧Enter</kbd> newline <span className="sep">·</span>
                <kbd>⌘⇧V</kbd> voice
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ─── Status Bar ─── */}
      <footer className="status-bar">
        <div className="sb-left">
          <span className={`sb-dot ${agentStatus}`} />
          <span>{statusText()}</span>
          {isRecording && <span className="sb-rec">● REC</span>}
        </div>
        <div className="sb-center">
          {!showTerminal && (
            <button className="sb-btn" onClick={() => setShowTerminal(true)}>
              <VscTerminal size={12} /> Terminal
            </button>
          )}
        </div>
        <div className="sb-right">
          <span>{langFromFile(currentFile?.name)}</span>
          <span>UTF-8</span>
          <span className="sb-ver">ClawIDE v1.0</span>
        </div>
      </footer>

      {/* ─── Settings Overlay ─── */}
      {showSettings && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowSettings(false)}>
          <div className="settings-panel">
            <div className="settings-hdr">
              <h2>Settings</h2>
              <button className="i-btn" onClick={() => setShowSettings(false)}><VscClose size={18} /></button>
            </div>
            <div className="settings-body">
              <section className="s-section">
                <h3>Editor</h3>
                <div className="s-row"><label>Font Size</label><input type="number" value={settings.fontSize} onChange={e => setSettings(s => ({ ...s, fontSize: +e.target.value || 14 }))} min={10} max={24} /></div>
                <div className="s-row"><label>Tab Size</label>
                  <select value={settings.tabSize} onChange={e => setSettings(s => ({ ...s, tabSize: +e.target.value }))}>
                    <option value={2}>2</option><option value={4}>4</option><option value={8}>8</option>
                  </select></div>
                <div className="s-row"><label>Word Wrap</label>
                  <select value={settings.wordWrap} onChange={e => setSettings(s => ({ ...s, wordWrap: e.target.value }))}>
                    <option value="on">On</option><option value="off">Off</option>
                  </select></div>
                <div className="s-row"><label>Line Numbers</label>
                  <select value={settings.lineNumbers} onChange={e => setSettings(s => ({ ...s, lineNumbers: e.target.value }))}>
                    <option value="on">On</option><option value="off">Off</option><option value="relative">Relative</option>
                  </select></div>
                <div className="s-row"><label>Minimap</label>
                  <button className={`toggle${settings.minimap ? ' on' : ''}`} onClick={() => setSettings(s => ({ ...s, minimap: !s.minimap }))}><span className="knob" /></button></div>
                <div className="s-row"><label>Font Ligatures</label>
                  <button className={`toggle${settings.fontLigatures ? ' on' : ''}`} onClick={() => setSettings(s => ({ ...s, fontLigatures: !s.fontLigatures }))}><span className="knob" /></button></div>
                <div className="s-row"><label>Bracket Colors</label>
                  <button className={`toggle${settings.bracketPairs ? ' on' : ''}`} onClick={() => setSettings(s => ({ ...s, bracketPairs: !s.bracketPairs }))}><span className="knob" /></button></div>
              </section>
              <section className="s-section">
                <h3>AI Agent</h3>
                <div className="s-row"><label>Status</label><span className={`s-status ${agentStatus}`}>{agentStatus === 'ready' ? '● Connected' : agentStatus === 'thinking' ? '● Processing' : '○ ' + agentStatus}</span></div>
                <p className="s-info">Connected to OpenClaw Gateway. Configure via <code>.env</code> file.</p>
              </section>
              <section className="s-section">
                <h3>Keyboard Shortcuts</h3>
                <div className="shortcuts">
                  <div className="sc"><kbd>⌘K</kbd><span>Inline Edit</span></div>
                  <div className="sc"><kbd>⌘J</kbd><span>Focus Chat</span></div>
                  <div className="sc"><kbd>⌘B</kbd><span>Toggle Explorer</span></div>
                  <div className="sc"><kbd>⌘`</kbd><span>Toggle Terminal</span></div>
                  <div className="sc"><kbd>⌘S</kbd><span>Save File</span></div>
                  <div className="sc"><kbd>⌘⇧V</kbd><span>Voice Input</span></div>
                </div>
              </section>
              <section className="s-section">
                <h3>About</h3>
                <p className="s-info"><strong>ClawIDE</strong> v1.0<br />React · Monaco Editor · xterm.js<br />Powered by OpenClaw AI Gateway</p>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ─── CmdK Modal ─── */}
      {showCmdK && (
        <CmdKModal
          onClose={() => setShowCmdK(false)}
          content={currentFile?.content || ''}
          fileName={currentFile?.name || 'untitled'}
          onSuggestionSubmit={(edits) => { if (edits?.[0]?.newText) updateCode(edits[0].newText); setShowCmdK(false); }}
          agentStatus={agentStatus}
        />
      )}
    </div>
  );
}

export default App;
