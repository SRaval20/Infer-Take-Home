FROM node:20-slim

# Chromium system dependencies
RUN apt-get update && apt-get install -y \
  chromium \
  libnss3 \
  libatk-bridge2.0-0 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Install Playwright's own Chromium (stealth plugin requires it)
RUN npx playwright install chromium --with-deps

COPY src ./src
COPY .env.example .env.example

RUN mkdir -p sessions output

EXPOSE 3001
CMD ["node", "src/index.js"]
