FROM node:22-slim

WORKDIR /app

RUN apt-get update && apt-get install -y nano vim curl iputils-ping postgresql-client

COPY package*.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci

RUN npm install @rollup/rollup-linux-x64-gnu

COPY . .

ARG BACKEND_ENV_FILE_CONTENTS
RUN printf "%s" "$BACKEND_ENV_FILE_CONTENTS" > .env

RUN npm run build

EXPOSE 9000

CMD ["npm", "run", "start"]