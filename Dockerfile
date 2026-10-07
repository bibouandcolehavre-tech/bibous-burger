FROM node:22-alpine

WORKDIR /app
COPY server ./server
COPY driver-app ./driver-app
COPY news-config.js ./news-config.js
COPY customer-identity.js ./customer-identity.js
COPY service-policy.js ./service-policy.js
COPY dietary-policy.js ./dietary-policy.js
COPY custom-burger-preview.js ./custom-burger-preview.js

ENV PORT=3001
EXPOSE 3001

CMD ["node", "server/server.js"]
