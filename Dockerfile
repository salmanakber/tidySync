# TidySync production deployment — sync.tidyflowapp.com

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install

FROM deps AS build
ARG SHOPIFY_API_KEY=""
ENV DATABASE_URL=postgresql://tidysync:tidysync@postgres:5432/tidysync
ENV NEXT_PUBLIC_API_URL=/api/graphql
ENV NEXT_PUBLIC_SHOPIFY_API_KEY=$SHOPIFY_API_KEY
ENV NEXT_PUBLIC_UPLOAD_URL=/api/upload
ENV NEXT_PUBLIC_DOWNLOAD_URL=/download
RUN pnpm db:generate
RUN pnpm --filter @tidysync/shared build
RUN pnpm --filter @tidysync/ai build
RUN pnpm --filter @tidysync/database build
RUN pnpm --filter @tidysync/api build
RUN pnpm --filter @tidysync/worker build
RUN pnpm --filter @tidysync/embedded build
RUN pnpm --filter @tidysync/admin build

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
