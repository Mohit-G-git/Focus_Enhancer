FROM node:20-alpine

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy source code
COPY src/ ./src/

# Create uploads directory
RUN mkdir -p uploads

# Expose port (Railway sets PORT env var)
EXPOSE ${PORT:-5000}

# Start the server
CMD ["node", "src/app.js"]
