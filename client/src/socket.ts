import { io } from 'socket.io-client';

// VITE_SERVER_URL is set in client/.env (dev) or left blank (production).
// When blank the browser connects to its own origin, which is correct when
// Express serves the built client.
const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;

export const socket = io(serverUrl);
