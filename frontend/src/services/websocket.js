import { BASE_WS_URL, ENDPOINTS } from '../utils/constants';

export class CallWebSocket {
  constructor(username, onMessageReceived) {
    this.username = username;
    this.onMessageReceived = onMessageReceived;
    this.socket = null;
  }

  connect() {
    const url = `${BASE_WS_URL}${ENDPOINTS.CALL_WS}`;
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      console.log('Connected to signaling server');
      this.socket.send(JSON.stringify({
        type: 'register',
        username: this.username
      }));
    };

    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.onMessageReceived(data);
    };

    this.socket.onclose = () => {
      console.log('Disconnected from signaling server');
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
    if (this.socket) {
      this.socket.close();
    }
  }
}
