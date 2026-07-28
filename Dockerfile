# syntax=docker/dockerfile:1

# The build stage always runs on the *builder's* architecture. Everything it
# produces is plain JavaScript, so a multi-architecture image costs no emulation
# — only the tiny runtime stage differs per target.
FROM --platform=$BUILDPLATFORM oven/bun:1-alpine AS build

# The image ships a `node` shim that is really Bun, so anything with a
# `#!/usr/bin/env node` shebang runs under Bun. vue-tsc patches TypeScript to
# understand .vue files and that patch does not take under Bun, leaving every
# .vue import unresolved. Real Node is build-only; the runtime stage below is
# pure Bun and never sees it.
RUN apk add --no-cache nodejs

WORKDIR /app

# Dependencies first, so a source-only change reuses the cached install layer.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Typechecks, bundles the client into dist/, and bundles the server — with its
# dependencies inlined — into dist-server/index.js.
RUN bun run build


FROM oven/bun:1-alpine AS runtime

ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    STATIC_DIR=/app/dist

WORKDIR /app

# The server bundle carries its own dependencies, so there is no node_modules
# in the runtime image at all.
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server/index.js ./index.js

USER bun
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Bun is PID 1 here; the server installs its own SIGTERM handler so that stops
# and redeploys shut down cleanly instead of being killed.
CMD ["bun", "index.js"]
