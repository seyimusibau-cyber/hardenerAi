# Ephemeral scanner worker. Built + pushed to registry.fly.io/hardener-scanner:latest
# (the image the qstash webhook already references).
FROM node:20-slim

# System deps: git (clone + patch apply), python (semgrep + python test runner)
RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl python3 python3-pip python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

# Semgrep (pinned) in an isolated venv, exposed on PATH
RUN python3 -m venv /opt/semgrep \
    && /opt/semgrep/bin/pip install --no-cache-dir semgrep==1.90.0 pytest==8.3.3
ENV PATH="/opt/semgrep/bin:${PATH}"

# Gitleaks (secret scanning), pinned
ARG GITLEAKS_VERSION=8.18.4
RUN curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
      | tar -xz -C /usr/local/bin gitleaks

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY *.mjs ./

# git needs an identity for `git apply --3way` / stash
RUN git config --global user.email "worker@hardener.ai" \
    && git config --global user.name "Hardener Worker" \
    && git config --global init.defaultBranch main

CMD ["node", "scan.mjs"]
