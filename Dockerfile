# ── Stage 1: Build frontend ──────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production backend + frontend bundle ───────────────
FROM node:20-alpine
WORKDIR /app

# Install production deps only
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY backend/src/ ./src/

# Copy built frontend into public/ (served by Express)
COPY --from=frontend-build /app/frontend/dist ./public/

# Create uploads directory
RUN mkdir -p uploads

EXPOSE ${PORT:-5000}
CMD ["node", "src/app.js"]
