# TidySync production deployment — sync.tidyflowapp.com

FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci

FROM deps AS build
ARG SHOPIFY_API_KEY=""
ENV DATABASE_URL=postgresql://tidysync:tidysync@postgres:5432/tidysync
ENV NEXT_PUBLIC_API_URL=/api/graphql
ENV NEXT_PUBLIC_SHOPIFY_API_KEY=$SHOPIFY_API_KEY
ENV NEXT_PUBLIC_UPLOAD_URL=/api/upload
ENV NEXT_PUBLIC_DOWNLOAD_URL=/download
RUN npm run db:generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/
COPY --from=build /app/apps/embedded/.next ./apps/embedded/.next
COPY --from=build /app/apps/embedded/package.json ./apps/embedded/
COPY --from=build /app/apps/embedded/public ./apps/embedded/public
COPY --from=build /app/apps/admin/.next ./apps/admin/.next
COPY --from=build /app/apps/admin/package.json ./apps/admin/
COPY --from=build /app/apps/admin/public ./apps/admin/public
COPY --from=build /app/ecosystem.config.js ./
COPY --from=build /app/deploy ./deploy

RUN mkdir -p /app/uploads

EXPOSE 3000 3001 4000

CMD ["node", "deploy/start.js"]
