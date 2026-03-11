FROM python:3.12-slim AS builder

WORKDIR /app
COPY pyproject.toml .
COPY app/ app/
RUN pip install --no-cache-dir .

FROM builder AS dev

RUN pip install --no-cache-dir ".[dev]"
COPY tests/ tests/
COPY alembic/ alembic/
COPY alembic.ini .

FROM python:3.12-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        wget apt-transport-https gnupg lsb-release \
    && wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key \
        | gpg --dearmor -o /usr/share/keyrings/trivy.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb generic main" \
        | tee /etc/apt/sources.list.d/trivy.list \
    && apt-get update && apt-get install -y --no-install-recommends trivy \
    && apt-get purge -y wget gnupg lsb-release \
    && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn
COPY --from=builder /usr/local/bin/alembic /usr/local/bin/alembic
COPY app/ app/
COPY alembic/ alembic/
COPY alembic.ini .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
