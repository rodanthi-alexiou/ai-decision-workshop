FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY client/package.json client/package-lock.json* client/
COPY server/package.json server/package-lock.json* server/
RUN npm install --prefix client && npm install --prefix server

COPY client client
COPY server server
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY server/package.json server/package-lock.json* server/
RUN npm install --omit=dev --prefix server

COPY --from=build /app/client/dist client/dist
COPY --from=build /app/server/dist server/dist

EXPOSE 3001
CMD ["npm", "run", "start"]
