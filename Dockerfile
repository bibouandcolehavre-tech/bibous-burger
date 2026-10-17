FROM node:22-alpine AS statement-dependencies
WORKDIR /app/server/pdf
COPY server/pdf/package.json server/pdf/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-alpine

WORKDIR /app
COPY server ./server
COPY --from=statement-dependencies /app/server/pdf/node_modules ./server/pdf/node_modules
COPY driver-app ./driver-app
COPY news-config.js ./news-config.js
COPY customer-identity.js ./customer-identity.js
COPY kiosk-qr-client.js ./kiosk-qr-client.js
COPY service-policy.js ./service-policy.js
COPY delivery-pricing.js ./delivery-pricing.js
COPY delivery-status-copy.js ./delivery-status-copy.js
COPY cheese-naans.js ./cheese-naans.js
COPY dietary-policy.js ./dietary-policy.js
COPY custom-burger-preview.js ./custom-burger-preview.js
COPY product-offer.js ./product-offer.js
COPY bibou-plus-offer.js ./bibou-plus-offer.js
COPY contest-prize-policy.js ./contest-prize-policy.js
COPY privacy-policy.js ./privacy-policy.js

ENV PORT=3001
EXPOSE 3001

CMD ["node", "server/server.js"]
