# syntax=docker/dockerfile:1

# The build stage always runs on the *builder's* architecture. Everything it
# produces is plain JavaScript, so a multi-architecture image costs no emulation
# — only the tiny runtime stage differs per target.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build

WORKDIR /app

# Dependencies first, so a source-only change reuses the cached install layer.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Typechecks, bundles the client into dist/, and bundles the server — with its
# dependencies inlined — into dist-server/index.cjs.
RUN npm run build


FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    STATIC_DIR=/app/dist

WORKDIR /app

# The server bundle carries its own dependencies, so there is no node_modules
# in the runtime image at all.
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server/index.cjs ./index.cjs

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Node is PID 1 here; the server installs its own SIGTERM handler so that stops
# and redeploys shut down cleanly instead of being killed.
CMD ["node", "index.cjs"]
