const { v4: uuidv4 } = require('uuid');
const AutomationEngine = require('../AutomationEngine');

const sessions = new Map();

function getSession(sessionId) {
  return sessions.get(sessionId);
}

function handleConnection(ws) {
  let sessionId = null;

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'start') {
      const { carrier, username, password } = msg.payload;
      if (!carrier || !username || !password) {
        send(ws, 'error', { message: 'Missing carrier, username, or password' });
        return;
      }

      sessionId = uuidv4();
      send(ws, 'session_created', { sessionId });

      const engine = new AutomationEngine(sessionId, carrier, username, password, (type, payload) => {
        if (ws.readyState === ws.OPEN) send(ws, type, payload);
      });

      sessions.set(sessionId, { engine, ws });
      engine.run(); // fire-and-forget, events come back via send()

    } else if (msg.type === 'mfa_submit') {
      const session = sessions.get(msg.sessionId || sessionId);
      if (session) {
        session.engine.submitMFA(msg.payload.code);
      }

    } else if (msg.type === 'ping') {
      send(ws, 'pong', {});
    }
  });

  ws.on('close', () => {
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (session) session.engine.cleanup();
      sessions.delete(sessionId);
    }
  });
}

function send(ws, type, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

module.exports = { handleConnection, getSession };
