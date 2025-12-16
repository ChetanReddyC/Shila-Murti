FROM node:22-slim

WORKDIR /app

RUN apt-get update && apt-get install -y nano vim curl iputils-ping postgresql-client

COPY package*.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci 

COPY . .

ARG BACKEND_ENV_FILE_CONTENTS
RUN printf "%s" "$BACKEND_ENV_FILE_CONTENTS" > .env

EXPOSE 9000

CMD ["npm", "run", "dev"]