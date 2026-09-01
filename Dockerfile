# --- Stage 1: build do frontend React ---
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: backend Python + frontend já buildado ---
FROM python:3.11-slim

WORKDIR /app

# Instala dependências do backend
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copia o backend
COPY backend/ ./backend/
COPY run.py ./

# Copia o build do frontend gerado no stage anterior
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Pasta de dados do SQLite — monte um volume persistente aqui em produção
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV PORT=8000
EXPOSE 8000

CMD ["python", "-m", "uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
