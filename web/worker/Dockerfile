FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx tsc -p worker/tsconfig.worker.json
RUN npm prune --omit=dev
CMD ["node", "worker/dist/worker/index.js"]
