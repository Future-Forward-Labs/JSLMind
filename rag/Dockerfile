FROM python:3.11-slim

# Corporate proxy (Netskope): inject CA bundle so pip and requests can verify SSL.
# netskope-ca-bundle.pem is gitignored — re-export from System Keychain before building.
COPY netskope-ca-bundle.pem /usr/local/share/ca-certificates/netskope-ca.crt
RUN update-ca-certificates
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
ENV PIP_CERT=/etc/ssl/certs/ca-certificates.crt

# System deps for unstructured PDF parsing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    poppler-utils \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

VOLUME ["/docs"]

EXPOSE 8001

CMD ["sh", "-c", "python seed_corpus.py && uvicorn app:app --host 0.0.0.0 --port 8001"]
