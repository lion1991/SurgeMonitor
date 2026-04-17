FROM node:22-alpine AS runtime

WORKDIR /app

# Copy only what's needed to run
COPY package.json ./
COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/

# Create data directory for SQLite database
RUN mkdir -p /data

EXPOSE 8787

ENV HOST=0.0.0.0
ENV PORT=8787
ENV SURGE_DASHBOARD_DB=/data/surge-dashboard.sqlite

CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
