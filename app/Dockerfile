# Life Tracker planner image. Build context = repo root. No personal data inside (see .dockerignore).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY app/package*.json ./
RUN npm ci
COPY app/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="life-tracker" \
      org.opencontainers.image.description="Life Tracker planner: calendar + day planner + calendar sharing" \
      org.opencontainers.image.source="https://github.com/chicenwangs/lifetracker" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 \
    DATABASE_PATH=/app/data/app.db SEED_DIR=/app/data/seed \
    APP_VERSION=${VERSION} \
    BODY_SIZE_LIMIT=26M
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/reset-password.mjs ./scripts/reset-password.mjs
RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build"]
