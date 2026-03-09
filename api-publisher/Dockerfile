FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY src ./src
COPY tests ./tests

EXPOSE 8000

CMD ["node", "src/app.js"]
