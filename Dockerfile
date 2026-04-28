FROM node:24-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3400
ENV HOST=0.0.0.0

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server

EXPOSE 3400
CMD ["npm", "start"]
