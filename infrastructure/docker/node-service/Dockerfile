# Builds any one of this monorepo's Node backend services (platform-api,
# execution-api, provisioning-worker, interactive-run-api). NOT for apps/web
# — that's a Next.js app deployed to Vercel, not this box.
#
# Build from the REPO ROOT (the context must be the root so npm workspaces
# resolve), selecting the service via SERVICE:
#
#   docker build --build-arg SERVICE=platform-api \
#     -f infrastructure/docker/node-service/Dockerfile \
#     -t sqweb/platform-api:prod .
#
# Workspace packages (@sqweb/contracts etc.) resolve to raw TypeScript
# source at runtime (see each package's "exports" field), not compiled
# dist/ — that's why the runtime stage still needs tsx and packages/*/src,
# not just this one service's own compiled dist/main.js.

FROM node:22-bookworm-slim AS builder
WORKDIR /repo
COPY . .
RUN npm ci
ARG SERVICE
RUN npm run build --workspace @sqweb/${SERVICE}
# Prunes across the WHOLE workspace tree, not just this service — a
# dependency another workspace declares (e.g. tsx, only listed directly by
# platform-api/execution-api but hoisted for every service to use) survives
# the prune as long as at least one workspace in this install still needs
# it. Simpler than trying to hand-isolate a per-service dependency subset.
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ARG SERVICE
ENV SERVICE=${SERVICE}
WORKDIR /repo
RUN groupadd --system sqweb && useradd --system --gid sqweb --create-home sqweb
COPY --from=builder --chown=sqweb:sqweb /repo/node_modules ./node_modules
COPY --from=builder --chown=sqweb:sqweb /repo/package.json ./package.json
COPY --from=builder --chown=sqweb:sqweb /repo/packages ./packages
COPY --from=builder --chown=sqweb:sqweb /repo/apps/${SERVICE}/dist ./apps/${SERVICE}/dist
COPY --from=builder --chown=sqweb:sqweb /repo/apps/${SERVICE}/package.json ./apps/${SERVICE}/package.json
USER sqweb
WORKDIR /repo/apps/${SERVICE}
# tsx, not plain node — workspace packages import as raw .ts source, so the
# compiled dist/main.js still needs tsx's loader at import time even though
# this one file was itself precompiled. Matches how the existing
# apps/platform-api "start" script already runs (tsx dist/main.js).
CMD ["npx", "tsx", "dist/main.js"]
