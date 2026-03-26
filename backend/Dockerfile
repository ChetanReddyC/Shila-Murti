FROM node:22-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl postgresql-client && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline --no-optional 

COPY . .

ARG BACKEND_ENV_FILE_CONTENTS
RUN printf "%s" "$BACKEND_ENV_FILE_CONTENTS" > .env

RUN npm run build

EXPOSE 9000

CMD ["npm", "run", "build"]
