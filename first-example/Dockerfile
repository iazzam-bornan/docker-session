FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY public ./public
COPY src ./src

RUN npm run build

EXPOSE 3000

CMD ["node", "-r", "tsconfig-paths/register", "dist/index.js"]