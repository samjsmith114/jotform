FROM mcr.microsoft.com/playwright:v1.45.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN npx playwright install chromium

COPY . .

ENV PORT=10000
EXPOSE 10000

CMD ["node", "server.js"]
