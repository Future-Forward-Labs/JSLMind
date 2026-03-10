# Stage 1: build
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Bake Langfuse + LiteLLM keys into the bundle at build time
ARG VITE_LANGFUSE_PUBLIC_KEY
ARG VITE_LANGFUSE_SECRET_KEY
ARG VITE_LITELLM_KEY
ENV VITE_LANGFUSE_PUBLIC_KEY=$VITE_LANGFUSE_PUBLIC_KEY
ENV VITE_LANGFUSE_SECRET_KEY=$VITE_LANGFUSE_SECRET_KEY
ENV VITE_LITELLM_KEY=$VITE_LITELLM_KEY
RUN npm run build

# Stage 2: serve
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
