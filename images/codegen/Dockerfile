FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

COPY --from=ghcr.io/blaxel-ai/sandbox:latest@sha256:17c2840e7edf02cd0c3444efcaf234f191a36ede5b0d55b166b84b7ce5e3f3e8 /sandbox-api /usr/local/bin/sandbox-api

RUN apk add --no-cache ca-certificates git make g++ python3 unzip \
  && addgroup -S builder \
  && adduser -S -G builder builder \
  && mkdir -p /workspace \
  && chown -R builder:builder /workspace

COPY entrypoint.sh /entrypoint.sh
RUN chmod 0755 /entrypoint.sh

WORKDIR /workspace
ENV HOME=/home/builder
ENTRYPOINT ["/entrypoint.sh"]
