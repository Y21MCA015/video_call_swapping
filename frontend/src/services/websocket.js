import { BASE_WS_URL, ENDPOINTS } from '../utils/constants';

export class CallWebSocket {
  constructor(username, onMessageReceived) {
    this.username = username;
    this.onMessageReceived = onMessageReceived;
    this.socket = null;
    this.reconnectDelay = 1000; // start at 1s, doubles each retry
    this.pingInterval = null;
    this.shouldReconnect = true;
  }

  connect() {
    const url = `${BASE_WS_URL}${ENDPOINTS.CALL_WS}`;
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      console.log('Connected to signaling server');
      this.reconnectDelay = 1000; // reset backoff on successful connect
      // Register user immediately
      this.socket.send(JSON.stringify({
        type: 'register',
        username: this.username
      }));
      // Start heartbeat to keep Render free tier alive
      this.pingInterval = setInterval(() => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000); // ping every 30 seconds
    };

    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'pong') return; // ignore server pong replies
      this.onMessageReceived(data);
    };

    this.socket.onclose = () => {
      console.log('Disconnected from signaling server. Reconnecting...');
      clearInterval(this.pingInterval);
      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // max 30s backoff
      }
    };

    this.socket.onerror = (err) => {
      console.error('WebSocket error:', err);
      this.socket.close();
    };
  }

  sendMessage(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    } else {
      console.error('WebSocket not connected');
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    clearInterval(this.pingInterval);
    if (this.socket) {
      this.socket.close();
    }
  }
}
