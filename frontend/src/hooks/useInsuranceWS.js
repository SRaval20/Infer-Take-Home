import { useCallback, useEffect, useRef, useState } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

export function useInsuranceWS() {
  const ws = useRef(null);
  const intentionalClose = useRef(false);
  const heartbeat = useRef(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [documents, setDocuments] = useState([]);
  const sessionId = useRef(null);

  const connect = useCallback(() => {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(WS_URL);
      socket.onopen = () => resolve(socket);
      socket.onerror = () => reject(new Error('WebSocket connection failed'));
    });
  }, []);

  const startSession = useCallback(async ({ carrier, username, password }) => {
    setStatus('starting');
    setError(null);
    setDocuments([]);
    intentionalClose.current = false;

    const socket = await connect();
    ws.current = socket;

    // Keep the connection alive through idle periods (e.g. waiting on the user for an MFA code) —
    // some tunnels/proxies drop WebSockets that sit silent too long.
    heartbeat.current = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
    }, 20000);

    socket.onmessage = (event) => {
      const { type, payload } = JSON.parse(event.data);

      if (type === 'session_created') {
        sessionId.current = payload.sessionId;
      } else if (type === 'status') {
        setStatus(payload.step);
      } else if (type === 'mfa_required') {
        setStatus('mfa_required');
      } else if (type === 'complete') {
        setDocuments(payload.documents);
        setStatus('complete');
      } else if (type === 'error') {
        setError(payload.message);
        setStatus('error');
      }
    };

    socket.onclose = () => {
      clearInterval(heartbeat.current);
      // Ignore closes triggered by reset() or component unmount
      if (!intentionalClose.current) {
        setStatus('error');
        setError('Connection closed unexpectedly. Please try again.');
      }
    };

    socket.send(JSON.stringify({
      type: 'start',
      payload: { carrier, username, password },
    }));
  }, [connect]);

  const submitMFA = useCallback((code) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'mfa_submit',
        sessionId: sessionId.current,
        payload: { code },
      }));
      setStatus('logging_in');
    }
  }, []);

  const reset = useCallback(() => {
    intentionalClose.current = true;
    clearInterval(heartbeat.current);
    ws.current?.close();
    ws.current = null;
    sessionId.current = null;
    setStatus('idle');
    setError(null);
    setDocuments([]);
  }, []);

  useEffect(() => () => {
    intentionalClose.current = true;
    clearInterval(heartbeat.current);
    ws.current?.close();
  }, []);

  return { status, error, documents, startSession, submitMFA, reset };
}
