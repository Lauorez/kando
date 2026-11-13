FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node server.js store.js mcp.js mcp-access.js mcp-stdio.js ./
COPY --chown=node:node public ./public
COPY --chown=node:node assets ./assets
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/kando.sqlite
EXPOSE 3000
CMD ["node", "server.js"]
