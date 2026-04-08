import { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import Markdown from 'react-markdown';
import { VscClose, VscWand, VscArrowRight } from 'react-icons/vsc';
import './CmdKModal.css';

const socket = io('http://localhost:3000', { transports: ['websocket'] });

export default function CmdKModal({ onClose, content, fileName, onSuggestionSubmit, agentStatus }) {
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState(null);
  const [status, setStatus] = useState('idle');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (data) => { setReply(data.reply || 'No suggestions.'); setStatus('done'); };
    socket.on('cmd-k-response', handler);
    return () => socket.off('cmd-k-response', handler);
  }, []);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setStatus('loading');
    setReply(null);
    socket.emit('cmd-k-request', { prompt, fileName, content });
  };

  return (
    <div className="cmdk-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk-content">
        <div className="cmdk-head">
          <div className="cmdk-head-left">
            <VscWand size={16} className="cmdk-wand" />
            <span>Inline Edit</span>
          </div>
          <button className="cmdk-x" onClick={onClose}><VscClose size={16} /></button>
        </div>

        <div className="cmdk-file">
          <span className="cmdk-file-label">Editing:</span>
          <span className="cmdk-file-name">{fileName}</span>
        </div>

        {status === 'idle' && (
          <form onSubmit={handleSubmit} className="cmdk-form">
            <input
              ref={inputRef} value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the change… e.g. Add error handling"
              className="cmdk-input" autoFocus
            />
            <button type="submit" className="cmdk-go" disabled={!prompt.trim()}>
              <VscArrowRight size={16} />
            </button>
          </form>
        )}

        {status === 'loading' && (
          <div className="cmdk-loading">
            <div className="cmdk-spinner" />
            <span>Analyzing…</span>
          </div>
        )}

        {status === 'done' && reply && (
          <div className="cmdk-result">
            <div className="cmdk-reply"><Markdown>{reply}</Markdown></div>
            <div className="cmdk-foot">
              <button className="cmdk-btn primary" onClick={() => { setStatus('idle'); setReply(null); setPrompt(''); }}>
                New Request
              </button>
              <button className="cmdk-btn" onClick={onClose}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
