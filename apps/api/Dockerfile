FROM node:22-alpine

WORKDIR /app
COPY . .
RUN npm ci \
    && npx prisma generate --schema=apps/api/prisma/schema.prisma \
    && mkdir -p /data \
    && chown node:node /data

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
USER node

CMD ["sh", "-c", "npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma && npm run start --workspace=api"]
