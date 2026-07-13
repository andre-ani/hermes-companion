FROM node:22-bookworm-slim AS bridge-build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/bridge/package.json apps/bridge/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --workspace=@hermes-companion/bridge --include-workspace-root
COPY apps/bridge apps/bridge
COPY packages/contracts packages/contracts
RUN npm run build --workspace=@hermes-companion/bridge

FROM nousresearch/hermes-agent@sha256:8986f497b2dd9a89bd455bdd233070c32ae9d6e7176087904d5d0a78294a5bf8
USER root
COPY --from=bridge-build /usr/local/bin/node /usr/local/bin/node
COPY --from=bridge-build /app/node_modules /opt/hermes-companion/node_modules
COPY --from=bridge-build /app/apps/bridge/dist /opt/hermes-companion/apps/bridge/dist
COPY --from=bridge-build /app/apps/bridge/package.json /opt/hermes-companion/apps/bridge/package.json
COPY --from=bridge-build /app/packages/contracts /opt/hermes-companion/packages/contracts
COPY infra/hermes-runtime/start.sh /opt/hermes-companion/start.sh
RUN chmod 0755 /opt/hermes-companion/start.sh && mkdir -p /opt/data/hermes-companion
ENV NODE_ENV=production BRIDGE_HOST=0.0.0.0 BRIDGE_STATE_DIR=/opt/data/hermes-companion BRIDGE_ALLOWED_ROOTS=/opt/data,/workspace,/app HERMES_UPSTREAM=http://127.0.0.1:8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD /usr/local/bin/node -e "fetch('http://127.0.0.1:'+(process.env.PORT||9130)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["/opt/hermes-companion/start.sh"]
