FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY src ./src
COPY tests ./tests

EXPOSE 8001

CMD ["node", "src/worker.js"]
