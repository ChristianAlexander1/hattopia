FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY client/ ./client/
COPY server/ ./server/
COPY shared/ ./shared/
ENV PORT=8080
EXPOSE 8080
VOLUME ["/app/data"]
CMD ["node", "server/server.mjs"]
