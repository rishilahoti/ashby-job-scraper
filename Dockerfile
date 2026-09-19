FROM node:22-alpine
WORKDIR /app
# Base image's Alpine package snapshot can lag behind upstream security fixes
# (e.g. openssl CVEs) — pull current patches at build time regardless of when
# the node:20-alpine tag was last published.
RUN apk update && apk upgrade --no-cache
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
# npm's bundled toolchain (tar, minimatch, cross-spawn, etc.) isn't used at
# runtime — deps are already installed above and CMD never invokes npm again —
# but it ships known CVEs in those vendored deps. Remove it from the image.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
CMD ["node", "index.js", "start"]
