FROM node:22-alpine AS build

WORKDIR /app
COPY . .
RUN npm ci --workspace=web \
    && npm run build --workspace=web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
