FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
ENV NODE_OPTIONS="--max-old-space-size=8192"
CMD ["npx", "tsx", "scripts/start.ts"]
