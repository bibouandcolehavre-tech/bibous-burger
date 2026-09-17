FROM node:22-alpine

WORKDIR /app
COPY server ./server

ENV PORT=3001
EXPOSE 3001

CMD ["node", "server/server.js"]
