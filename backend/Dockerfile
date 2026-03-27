FROM node:22-slim

WORKDIR /app

RUN apt-get update && apt-get install -y nano vim curl iputils-ping postgresql-client

COPY package*.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci

RUN npm install @rollup/rollup-linux-x64-gnu

COPY . .

RUN npm run build

EXPOSE 9000

CMD ["sh", "-c", "npx medusa db:migrate && npm run start"]
