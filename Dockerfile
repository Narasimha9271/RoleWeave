FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY" && npm run build

FROM python:3.11-slim-bookworm AS python-deps
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --target /app/.python-packages -r requirements.txt

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends python3 libgomp1 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=python-deps /app/.python-packages ./.python-packages
COPY --from=frontend /app/dist ./dist
COPY server ./server
RUN python3 -I -c "import sys; sys.path.insert(0, '/app/.python-packages'); import pymupdf; d = pymupdf.open(); d.new_page(); assert len(d.tobytes()) > 0"
ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000 PYTHON_BIN=python3
USER node
EXPOSE 10000
CMD ["node", "server/index.js"]
