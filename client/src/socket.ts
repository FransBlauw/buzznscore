import { io } from 'socket.io-client';

// Vite proxies /socket.io → localhost:3001 in dev (see vite.config.ts).
// In production the server serves the client on the same origin.
export const socket = io(window.location.origin);
