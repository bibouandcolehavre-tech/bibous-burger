FROM node:22-alpine

WORKDIR /app
COPY server ./server
COPY news-config.js ./news-config.js

ENV PORT=3001
EXPOSE 3001

CMD ["node", "server/server.js"]
