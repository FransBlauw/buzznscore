#!/bin/sh

export PORT=3001
echo "Starting server on PORT=$PORT"

# Start Express server in background
node /www/html/server/dist/server.js &

# Start nginx in foreground
nginx -g "daemon off;"