import { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import Markdown from 'react-markdown';
import { VscClose } from 'react-icons/vsc';
import './CmdKModal.css';

const socket = io('http://localhost:3000', { transports: ['websocket'] });

export default function CmdKModal({ onClose, content, fileName, onSuggestionSubmit, agentStatus }) {
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState(null);
  const [status, setStatus] = useState('idle');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (data) => {
      setReply(data.reply || 'No suggestions.');
      setStatus('success');
    };
    socket.on('cmd-k-response', handler);
    return () => socket.off('cmd-k-response', handler);
  }, []);

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
        <div className="cmdk-top">
          <h2>Ask Claw to edit code</h2>
          <button className="cmdk-close" onClick={onClose}><VscClose size={16} /></button>
        </div>

        {status === 'idle' && (
          <form onSubmit={handleSubmit} className="cmdk-form">
            <input
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Add error handling to this function"
              className="cmdk-input"
              autoFocus
            />
            <button type="submit" className="cmdk-submit" disabled={!prompt.trim()}>
              Ask Claw
            </button>
          </form>
        )}

        {status === 'loading' && (
          <div className="cmdk-loading">
            <div className="thinking-dots"><span /><span /><span /></div>
            <p>Analyzing your request...</p>
          </div>
        )}

        {status === 'success' && reply && (
          <div className="cmdk-result">
            <div className="cmdk-reply">
              <Markdown>{reply}</Markdown>
            </div>
            <div className="cmdk-actions">
              <button className="cmdk-submit" onClick={() => { setStatus('idle'); setReply(null); setPrompt(''); }}>
                New Request
              </button>
              <button className="cmdk-cancel" onClick={onClose}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
