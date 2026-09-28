# ============================================================
# Dockerfile — Microservicio de WhatsApp ENVIOS AYORA
# ============================================================
# whatsapp-web.js necesita Chrome para funcionar. El entorno "Node" normal
# de Render no trae Chrome ni sus librerías, así que lo instalamos aquí
# explícitamente y le decimos a Puppeteer que use ESE Chromium en vez de
# intentar descargar el suyo propio (lo que fallaba en el deploy).
# ============================================================

FROM node:18-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       chromium \
       fonts-liberation \
       libatk-bridge2.0-0 \
       libatk1.0-0 \
       libcups2 \
       libdrm2 \
       libgbm1 \
       libgtk-3-0 \
       libnspr4 \
       libnss3 \
       libx11-xcb1 \
       libxcomposite1 \
       libxdamage1 \
       libxfixes3 \
       libxrandr2 \
       libxshmfence1 \
       xdg-utils \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# No dejamos que Puppeteer intente descargar su propio Chromium al instalar
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Limitamos la memoria que usa el propio Node (no Chrome) para dejarle la
# mayor parte de los 512 MB del plan de Render disponibles para Chrome.
ENV NODE_OPTIONS=--max-old-space-size=128

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 4000

CMD ["node", "index.js"]
