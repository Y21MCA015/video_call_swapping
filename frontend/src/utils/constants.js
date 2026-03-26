// Vite automatically populates import.meta.env.MODE with 'development' or 'production'
export const isDevelopment = import.meta.env.MODE === 'development';

export const BASE_API_URL = isDevelopment
  ? 'http://192.168.0.133:8000/api'
  : 'https://api.dummy-production.com/api';

export const BASE_WS_URL = isDevelopment
  ? 'ws://192.168.0.133:8000/ws'
  : 'wss://api.dummy-production.com/ws';

export const ENDPOINTS = {
  CALL_WS: '/call/',
};
