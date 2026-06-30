FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

ARG VITE_WS_URL
ARG VITE_BACKEND_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL

RUN npm run build

FROM node:20-slim
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
