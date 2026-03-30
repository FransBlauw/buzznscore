# Stage 1 — Build
FROM node:20-alpine AS builder

WORKDIR /build

COPY . .
RUN npm run install:all
RUN npm run build


# Stage 2 — Runtime
FROM nginx:alpine

# Install node so we can run the Express server
RUN apk add --no-cache nodejs npm

# Copy built app
COPY --from=builder /build /www/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

ENV PORT=3000
EXPOSE 80

CMD ["/start.sh"]