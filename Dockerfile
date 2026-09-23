FROM python:3.12-slim

WORKDIR /app
RUN pip install --no-cache-dir "fastapi>=0.115" "uvicorn[standard]>=0.30"

COPY backend ./backend
COPY frontend ./frontend

ENV BELOTE_FRONTEND_DIR=/app/frontend
EXPOSE 8010

CMD ["uvicorn", "belote.app:app", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "8010", "--proxy-headers"]
