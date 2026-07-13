FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/bridge/package.json apps/bridge/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --workspace=@hermes-companion/bridge --include-workspace-root
COPY apps/bridge apps/bridge
COPY packages/contracts packages/contracts
RUN npm run build --workspace=@hermes-companion/bridge

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production BRIDGE_HOST=0.0.0.0 PORT=9130 BRIDGE_STATE_DIR=/opt/data/hermes-companion BRIDGE_ALLOWED_ROOTS=/opt/data,/workspace,/app
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/bridge/dist /app/apps/bridge/dist
COPY --from=build /app/apps/bridge/package.json /app/apps/bridge/package.json
COPY --from=build /app/packages/contracts /app/packages/contracts
RUN mkdir -p /opt/data/hermes-companion /workspace && chown -R node:node /opt/data /workspace
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||9130)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/bridge/dist/server.js"]
