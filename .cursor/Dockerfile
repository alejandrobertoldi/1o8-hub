FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# System packages: git/curl for the agent runtime, openssl for secret
# generation, and a local PostgreSQL server (the app hardcodes ssl:"require",
# so ssl-cert provides the snakeoil cert that Debian enables by default).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        curl \
        ca-certificates \
        openssl \
        sudo \
        postgresql \
        postgresql-contrib \
        ssl-cert \
    && rm -rf /var/lib/apt/lists/*

# Allow the default 'node' user to manage the local postgres service without a
# password. This is a local development database only.
RUN echo "node ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-node \
    && chmod 0440 /etc/sudoers.d/90-node

USER node
