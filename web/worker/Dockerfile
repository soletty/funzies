FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npx tsc -p worker/tsconfig.worker.json
CMD ["node", "dist/worker/index.js"]
