import { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';

const socket = io('http://localhost:5173');

export default function CmdKModal({ onClose, content, fileName, agentStatus }) {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setStatus('loading');
    setResponse(null);

    // Request from OpenClaw agent
    socket.emit('cmd-k-request', { 
      prompt: prompt, 
      fileName: fileName, 
      content: content 
    });

    // Listen for response
    const handler = (data) => {
      socket.off('cmd-k-response', handler);
      if (data.edits && data.edits.length > 0) {
        setResponse({ type: 'success', edits: data.edits });
        setStatus('success');
      } else {
        setResponse({ type: 'error', message: 'No suggestions from agent' });
        setStatus('error');
      }
    };

    socket.on('cmd-k-response', handler);
  };

  const applySuggestion = (edits) => {
    onClose();
    // In a real implementation, this would communicate with the editor
    // For now, we'll rely on the parent handling the apply action
    if (window.applyCmdKSuggestion) {
      window.applyCmdKSuggestion(edits);
    }
  };

  // Status indicator
  const getStatusText = () => {
    switch (status) {
      case 'idle': return 'Ask Claw to edit your code';
      case 'loading': return 'Claw is analyzing...';
      case 'success': return 'Claw has a suggestion!';
      case 'error': return 'Something went wrong';
      default: return '';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'idle': return '#666';
      case 'loading': return '#0e639c';
      case 'success': return '#008000';
      case 'error': return '#cc0000';
      default: return '#666';
    }
  };

  if (status === 'idle' && !response) {
    return (
      <div className="cmdk-overlay">
        <div className="cmdk-content">
          <h2>Ask Claw to edit code</h2>
          <div className="cmdk-status">
            <div className="cmdk-status-dot" style={{ backgroundColor: getStatusColor() }}></div>
            <span>{getStatusText()}</span>
          </div>
          <form onSubmit={handleSubmit} className="cmdk-form">
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., 'Add error handling to this function' or 'Refactor to use hooks'"
              className="cmdk-input"
              disabled={agentStatus !== 'ready'}
            />
            <div className="cmdk-actions">
              <button 
                type="submit" 
                className="cmdk-button"
                disabled={agentStatus !== 'ready' || status === 'loading'}
              >
                {status === 'loading' ? 'Analyzing...' : 'Ask Claw'}
              </button>
              <button 
                type="button" 
                onClick={onClose} 
                className="cmdk-cancel"
              >
                Cancel
              </button>
            </div>
          </form>
          {agentStatus !== 'ready' && (
            <div className="cmdk-warning">
              ⚠️ Agent is {agentStatus}. Please wait or check connection.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="cmdk-overlay">
        <div className="cmdk-content">
          <h2>Claw is thinking...</h2>
          <div className="cmdk-status">
            <div className="cmdk-status-dot" style={{ backgroundColor: '#0e639c' }}></div>
            <span>Analyzing your request...</span>
          </div>
          <p className="cmdk-hint">This may take a moment for complex requests.</p>
        </div>
      </div>
    );
  }

  if (response && response.type === 'success') {
    return (
      <div className="cmdk-overlay">
        <div className="cmdk-content">
          <h2>Claw's Suggestion</h2>
          <div className="cmdk-status">
            <div className="cmdk-status-dot" style={{ backgroundColor: '#008000' }}></div>
            <span>Ready to apply</span>
          </div>
          <pre className="suggestion-code">{response.edits[0]?.newText || ''}</pre>
          <div className="cmdk-actions">
            <button 
              onClick={() => applySuggestion(response.edits)} 
              className="cmdk-button"
              disabled={agentStatus !== 'ready'}
            >
              Apply Suggestion
            </button>
            <button 
              onClick={() => { setPrompt(''); setResponse(null); setStatus('idle'); }} 
              className="cmdk-button-secondary"
            >
              Refine Request
            </button>
            <button 
              onClick={onClose} 
              className="cmdk-button-secondary"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (response && response.type === 'error') {
    return (
      <div className="cmdk-overlay">
        <div className="cmdk-content">
          <h2>Error</h2>
          <div className="cmdk-status">
            <div className="cmdk-status-dot" style={{ backgroundColor: '#cc0000' }}></div>
            <span>{response.message}</span>
          </div>
          <button 
            onClick={() => { setPrompt(''); setResponse(null); setStatus('idle'); }} 
            className="cmdk-button"
          >
            Try Again
          </button>
          <button 
            onClick={onClose} 
            className="cmdk-button-secondary"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return null; // Shouldn't reach here
}
