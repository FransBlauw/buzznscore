#!/bin/sh

# Start Express server in background
node /www/html/server/dist/server.js &

# Start nginx in foreground
nginx -g "daemon off;"