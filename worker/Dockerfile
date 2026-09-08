# Ephemeral scanner worker. Built + pushed to registry.fly.io/vultix-scanner:latest
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

# osv-scanner (SCA / dependency vulns), pinned
ARG OSV_VERSION=1.9.1
RUN curl -sSfL "https://github.com/google/osv-scanner/releases/download/v${OSV_VERSION}/osv-scanner_linux_amd64" \
      -o /usr/local/bin/osv-scanner && chmod +x /usr/local/bin/osv-scanner

# nuclei (experimental DAST for live URLs), pinned
ARG NUCLEI_VERSION=3.3.5
RUN curl -sSfL "https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_amd64.zip" \
      -o /tmp/nuclei.zip && cd /usr/local/bin && (command -v unzip >/dev/null || (apt-get update && apt-get install -y unzip)) \
      && unzip -o /tmp/nuclei.zip nuclei && rm /tmp/nuclei.zip

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY *.mjs ./

# This container runs code it does not trust: an LLM-written test, executed
# inside a stranger's repository. So it runs as a fixed non-root uid, with a
# read-only root filesystem and a tmpfs for /tmp supplied at `docker run` time
# (see worker/server.mjs). Nothing here is writable at runtime.
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin vultix \
    && chmod -R a+rX /app

# git identity is NOT set here. A global config would live in root's home, which
# uid 10001 cannot read; server.mjs passes GIT_AUTHOR_* / GIT_COMMITTER_* and
# GIT_CONFIG_GLOBAL=/dev/null instead, so the identity travels with the run.
ENV GIT_CONFIG_GLOBAL=/dev/null \
    HOME=/tmp

USER 10001:10001

CMD ["node", "scan.mjs"]
