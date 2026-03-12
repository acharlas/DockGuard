FROM python:3.12-slim AS builder

WORKDIR /app
COPY pyproject.toml .
COPY app/ app/
RUN pip install --no-cache-dir .

FROM python:3.12-slim AS runtime

ARG DOCKGUARD_UID=10001
ARG DOCKGUARD_GID=10001

# Apply OS security patches + install Trivy in a single layer
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
        wget apt-transport-https gnupg lsb-release \
    && wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key \
        | gpg --dearmor -o /usr/share/keyrings/trivy.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb generic main" \
        | tee /etc/apt/sources.list.d/trivy.list \
    && apt-get update && apt-get install -y --no-install-recommends trivy \
    && apt-get purge -y wget gnupg lsb-release \
    && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -g ${DOCKGUARD_GID} dockguard \
    && useradd -u ${DOCKGUARD_UID} -g dockguard -d /home/dockguard -s /usr/sbin/nologin dockguard \
    && mkdir -p /home/dockguard/.cache/trivy && chown -R dockguard:dockguard /home/dockguard

WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn
COPY --from=builder /usr/local/bin/alembic /usr/local/bin/alembic
COPY app/ app/
COPY alembic/ alembic/
COPY alembic.ini .

RUN chown -R dockguard:dockguard /app

ENV TRIVY_CACHE_DIR=/home/dockguard/.cache/trivy
USER dockguard

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM runtime AS dev

USER root
COPY --from=builder /app/pyproject.toml .
RUN pip install --no-cache-dir ".[dev]"
COPY tests/ tests/
USER dockguard
