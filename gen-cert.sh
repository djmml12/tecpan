#!/bin/bash
set -e

CERT_DIR="$(cd "$(dirname "$0")/apps/backend" && pwd)"
CONF=$(mktemp)

cat > "$CONF" <<EOF
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_req

[dn]
CN = POS Local

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1  = 127.0.0.1
EOF

# Agrega IPs 192.168.0.1 – 192.168.0.254
for i in $(seq 1 254); do
  echo "IP.$((i + 1)) = 192.168.0.$i" >> "$CONF"
done

openssl req -x509 -newkey rsa:2048 -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" \
  -sha256 -days 3650 -nodes -config "$CONF"

rm "$CONF"

echo "Certificado generado en $CERT_DIR"
echo "  cert.pem  — $(openssl x509 -noout -subject -in "$CERT_DIR/cert.pem")"
echo "  válido hasta: $(openssl x509 -noout -enddate -in "$CERT_DIR/cert.pem")"
