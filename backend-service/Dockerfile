FROM python:3.12-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY backend-service/pyproject.toml .
COPY backend-service/src/ ./src/
COPY backend-service/rego/ ./rego/
RUN uv pip install --system -e .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health').raise_for_status()"

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
