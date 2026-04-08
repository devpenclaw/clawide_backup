/**
 * OpenClaw Gateway WebSocket client.
 *
 * Connects to the Gateway's WS control plane, performs the connect handshake,
 * and exposes a simple `send(message, opts)` that returns the agent reply.
 */

const WebSocket = require('ws');
const { randomUUID } = require('crypto');

class OpenClawClient {
  constructor({ url, token }) {
    this.url = url.replace(/^http/, 'ws'); // http → ws, https → wss
    this.token = token;
    this.ws = null;
    this.connected = false;
    this.pending = new Map();      // id → { resolve, reject, timeout }
    this.agentRuns = new Map();    // runId → { resolve, reject, chunks }
    this._connectPromise = null;
    this._reconnectTimer = null;
    this.deviceId = `clawide-${randomUUID().slice(0, 8)}`;
  }

  /* ── lifecycle ────────────────────────────────────────────────── */

  connect() {
    if (this._connectPromise) return this._connectPromise;
    this._connectPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url, {
          headers: {
            'Origin': this.url.replace(/^ws/, 'http')
          }
        });
      } catch (err) {
        this._connectPromise = null;
        return reject(err);
      }

      const timeout = setTimeout(() => {
        this.ws.terminate();
        this._connectPromise = null;
        reject(new Error('Gateway connect timeout (10 s)'));
      }, 10000);

      this.ws.on('open', () => {
        console.log('[OpenClaw] WS open, waiting for challenge…');
      });

      this.ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch {
          console.log('[OpenClaw] Non-JSON message:', raw.toString().slice(0, 200));
          return;
        }
        console.log('[OpenClaw] ←', msg.type + (msg.event ? '/' + msg.event : ''), msg.id || '');

        // Skip noisy events
        if (msg.type === 'event' && (msg.event === 'tick' || msg.event === 'health' || msg.event === 'heartbeat')) return;

        // 1. challenge → send connect
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
          this._sendConnect(msg.payload?.nonce);
          return;
        }

        // 2. connect response
        if (msg.type === 'res' && msg.payload?.type === 'hello-ok') {
          clearTimeout(timeout);
          this.connected = true;
          console.log('[OpenClaw] Connected to gateway (protocol', msg.payload.protocol + ')');
          resolve();
          return;
        }

        // 3. RPC response
        if (msg.type === 'res' && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id);
          clearTimeout(p.timeout);
          this.pending.delete(msg.id);
          if (msg.ok) {
            // agent accepted → store runId, wait for completion
            if (msg.payload?.runId) {
              this.agentRuns.set(msg.payload.runId, p.agentCtx);
            } else {
              p.resolve(msg.payload);
            }
          } else {
            p.reject(new Error(msg.error?.message || 'RPC error'));
          }
          return;
        }

        // 4. agent streaming events
        if (msg.type === 'event' && msg.event === 'agent') {
          this._handleAgentEvent(msg.payload);
          return;
        }

        // 5. session message events (transcript updates)
        if (msg.type === 'event' && msg.event === 'session.message') {
          this._handleSessionMessage(msg.payload);
          return;
        }

        // 6. chat events (delta/final)
        if (msg.type === 'event' && msg.event === 'chat') {
          this._handleChatEvent(msg.payload);
          return;
        }

        // 7. run status events
        if (msg.type === 'event' && (msg.event === 'run' || msg.event === 'agent.run' || msg.event === 'hooks.run')) {
          this._handleAgentEvent(msg.payload);
          return;
        }

        // 7. log unknown events with potential agent data
        if (msg.type === 'event' && msg.event !== 'tick' && msg.event !== 'health' && msg.event !== 'heartbeat') {
          console.log('[OpenClaw] Unhandled event:', msg.event);
        }
      });

      this.ws.on('error', (err) => {
        console.error('[OpenClaw] WS error:', err.message);
      });

      this.ws.on('close', (code, reason) => {
        console.log('[OpenClaw] WS closed, code:', code, 'reason:', reason?.toString());
        this.connected = false;
        this._connectPromise = null;
        // reject pending
        for (const [, p] of this.pending) { clearTimeout(p.timeout); p.reject(new Error('WS closed')); }
        this.pending.clear();
        for (const [, ctx] of this.agentRuns) { ctx.reject(new Error('WS closed')); }
        this.agentRuns.clear();
        // auto reconnect
        this._scheduleReconnect();
      });
    });
    return this._connectPromise;
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      console.log('[OpenClaw] Reconnecting…');
      this.connect().catch(() => {});
    }, 3000);
  }

  _sendConnect(nonce) {
    this._send({
      type: 'req',
      id: randomUUID(),
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'cli',
          version: '1.0.0',
          platform: process.platform,
          mode: 'cli',
          instanceId: this.deviceId
        },
        role: 'operator',
        scopes: ['operator.admin', 'operator.read', 'operator.write', 'operator.approvals', 'operator.pairing'],
        caps: ['tool-events'],
        auth: { token: this.token },
        userAgent: 'clawide/1.0.0',
        locale: 'en-US'
      }
    });
  }

  /* ── low-level send ───────────────────────────────────────────── */

  _send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  _rpc(method, params, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC ${method} timeout`));
      }, timeoutMs);
      const agentCtx = { resolve, reject, chunks: '' };
      this.pending.set(id, { resolve, reject, timeout, agentCtx });
      this._send({ type: 'req', id, method, params });
    });
  }

  /* ── agent events ─────────────────────────────────────────────── */

  _findAgentCtx(payload) {
    // Match by sessionKey containing the hooks runId
    const sessionKey = payload.sessionKey || '';
    for (const [hooksRunId, ctx] of this.agentRuns) {
      if (sessionKey.includes(hooksRunId)) return { hooksRunId, ctx };
    }
    // Fallback: match by exact runId
    if (payload.runId && this.agentRuns.has(payload.runId)) {
      return { hooksRunId: payload.runId, ctx: this.agentRuns.get(payload.runId) };
    }
    // Fallback: if only one pending run, use it (handles race conditions)
    if (this.agentRuns.size === 1) {
      const [hooksRunId, ctx] = this.agentRuns.entries().next().value;
      return { hooksRunId, ctx };
    }
    return null;
  }

  _handleAgentEvent(payload) {
    if (!payload) return;
    const match = this._findAgentCtx(payload);
    const ctx = match?.ctx;

    // streaming text chunk (agent events have data.delta)
    const delta = payload.delta || payload.data?.delta;
    if (delta) {
      if (ctx) ctx.chunks += delta;
      if (this.onDelta) this.onDelta(delta);
    }

    // lifecycle phase: end
    const phase = payload.data?.phase || payload.phase;
    if (phase === 'end' || phase === 'completed' || phase === 'done') {
      if (ctx && match) {
        this.agentRuns.delete(match.hooksRunId);
        const text = payload.data?.text || payload.text || payload.summary || ctx.chunks || '';
        ctx.resolve({ text });
      }
    }

    // lifecycle phase: error (only if no text was streamed)
    if (phase === 'error') {
      const errMsg = payload.data?.error || payload.error || 'Agent error';
      // Don't reject on error if we already have chunks — agent might retry
      if (ctx && !ctx.chunks) {
        console.log('[OpenClaw] Agent error (will wait for retry):', errMsg.slice(0, 100));
      }
    }

    // status-based completion (fallback)
    const status = payload.status;
    if (status === 'ok' || status === 'error' || status === 'done' || status === 'completed') {
      if (ctx && match) {
        this.agentRuns.delete(match.hooksRunId);
        const text = payload.summary || payload.text || ctx.chunks || '';
        ctx.resolve({ text });
      }
    }
  }

  _handleChatEvent(payload) {
    if (!payload) return;
    const match = this._findAgentCtx(payload);
    const ctx = match?.ctx;

    if (payload.state === 'delta' && payload.message?.content) {
      // Extract text from content array
      const textParts = payload.message.content
        .filter(c => c.type === 'text')
        .map(c => c.text);
      // We get cumulative text, so calculate delta from last known position
    }

    if (payload.state === 'final' && payload.message?.content) {
      const text = payload.message.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('');
      if (ctx && match && text) {
        this.agentRuns.delete(match.hooksRunId);
        ctx.resolve({ text });
      }
    }
  }

  _handleSessionMessage(payload) {
    if (!payload) return;
    if (payload.role === 'assistant' && payload.content) {
      const match = this._findAgentCtx(payload);
      if (match) {
        this.agentRuns.delete(match.hooksRunId);
        match.ctx.resolve({ text: payload.content });
      }
    }
  }

  /* ── public API ───────────────────────────────────────────────── */

  /**
   * Send a message via HTTP hooks and wait for the response via WS events.
   * Returns { text: string }.
   */
  async send(message, { sessionKey = 'main', onDelta } = {}) {
    if (!this.connected) await this.connect();

    if (onDelta) this.onDelta = onDelta;

    const httpUrl = this.url.replace(/^ws/, 'http');

    // Pre-register a temporary pending run to catch early WS events
    const tempId = '__pending_' + Date.now();
    const resultPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.agentRuns.delete(tempId);
        // Check if it was re-keyed to the actual runId
        for (const [key, ctx] of this.agentRuns) {
          if (ctx._tempId === tempId) {
            this.agentRuns.delete(key);
          }
        }
        this.onDelta = null;
        reject(new Error('Agent response timeout (90s)'));
      }, 90000);

      this.agentRuns.set(tempId, {
        _tempId: tempId,
        resolve: (result) => {
          clearTimeout(timeout);
          this.onDelta = null;
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timeout);
          this.onDelta = null;
          reject(err);
        },
        chunks: ''
      });
    });

    try {
      // Fire the agent via HTTP hooks endpoint
      const res = await fetch(httpUrl + '/hooks/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.token
        },
        body: JSON.stringify({ message })
      });
      const data = await res.json();

      if (!data.ok || !data.runId) {
        this.agentRuns.delete(tempId);
        this.onDelta = null;
        throw new Error(data.error || 'hooks/agent failed: ' + JSON.stringify(data));
      }

      console.log('[OpenClaw] Agent triggered, hooksRunId:', data.runId);

      // Re-key the pending run to the actual hooks runId
      const ctx = this.agentRuns.get(tempId);
      if (ctx) {
        this.agentRuns.delete(tempId);
        this.agentRuns.set(data.runId, ctx);
      }

      return resultPromise;
    } catch (err) {
      this.agentRuns.delete(tempId);
      this.onDelta = null;
      throw err;
    }
  }

  async health() {
    if (!this.connected) await this.connect();
    return this._rpc('health', {}, 5000);
  }

  destroy() {
    clearTimeout(this._reconnectTimer);
    this.ws?.close();
  }
}

module.exports = OpenClawClient;
