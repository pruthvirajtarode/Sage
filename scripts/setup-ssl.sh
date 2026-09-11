#!/bin/bash
# ============================================================
# SSL Setup Script for SAGE AI - Nginx + Let's Encrypt
# Usage: bash setup-ssl.sh <domain> <email>
# Example: bash setup-ssl.sh melissa.digital-dada.com admin@digital-dada.com
# ============================================================

set -e

DOMAIN=${1:-""}
EMAIL=${2:-""}

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "❌ Usage: bash setup-ssl.sh <your-domain.com> <your-email@example.com>"
    echo "   Example: bash setup-ssl.sh melissa.digital-dada.com admin@digital-dada.com"
    exit 1
fi

echo "=================================================="
echo "  🔐 SSL Setup for: $DOMAIN"
echo "  📧 Email: $EMAIL"
echo "=================================================="

# --- Step 1: Install Nginx ---
echo ""
echo "[1/5] Installing Nginx..."
if ! command -v nginx &> /dev/null; then
    apt-get update -qq
    apt-get install -y nginx
    systemctl enable nginx
    systemctl start nginx
    echo "✅ Nginx installed."
else
    echo "✅ Nginx already installed."
fi

# --- Step 2: Install Certbot ---
echo ""
echo "[2/5] Installing Certbot..."
if ! command -v certbot &> /dev/null; then
    apt-get install -y certbot python3-certbot-nginx
    echo "✅ Certbot installed."
else
    echo "✅ Certbot already installed."
fi

# --- Step 3: Create Nginx config (HTTP first, for domain verification) ---
echo ""
echo "[3/5] Creating Nginx reverse proxy config..."

cat > /etc/nginx/sites-available/sage-ai <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    # For Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Reverse proxy to Node.js app on port 3000
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    # For Server-Sent Events (SSE streaming)
    location /api/chat/stream {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400;
        chunked_transfer_encoding on;
    }
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/sage-ai /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx config
nginx -t
systemctl reload nginx
echo "✅ Nginx config created and reloaded."

# --- Step 4: Obtain SSL Certificate ---
echo ""
echo "[4/5] Obtaining SSL certificate from Let's Encrypt..."
echo "   ⚠️  Make sure DNS for '$DOMAIN' points to this server's IP!"
echo ""

certbot --nginx \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive \
    --redirect

echo "✅ SSL certificate obtained and Nginx updated for HTTPS."

# --- Step 5: Set up auto-renewal ---
echo ""
echo "[5/5] Setting up automatic certificate renewal..."

# Test renewal works
certbot renew --dry-run

# Add cron job to renew twice daily (standard practice)
(crontab -l 2>/dev/null | grep -v certbot; echo "0 2,14 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -

echo "✅ Auto-renewal configured (runs twice daily)."

echo ""
echo "=================================================="
echo "  ✅ SSL SETUP COMPLETE!"
echo "=================================================="
echo ""
echo "  🌐 Your app is now live at: https://$DOMAIN"
echo "  🔒 Certificate auto-renews every 60 days"
echo "  📊 Admin panel: https://$DOMAIN/admin.html"
echo "  🔌 Health check: https://$DOMAIN/api/health"
echo ""
echo "  To check Nginx status: systemctl status nginx"
echo "  To view Nginx logs:    tail -f /var/log/nginx/error.log"
echo "=================================================="
