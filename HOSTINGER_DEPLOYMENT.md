# Hostinger VPS Production Deployment

This app can run on a Hostinger VPS as a single Node service:

- Serves the built React UI from `dist/`.
- Receives Suno callbacks at `/api/suno/callback`.
- Stores callback records in `data/suno-callbacks.json`.
- Lets the frontend load callbacks from `/api/suno/callbacks`.

## 1. Prepare the VPS

The repository also includes a `Dockerfile` and `docker-compose.yml` for Hostinger's Docker + Traefik VPS template. The compose file is configured for this production domain:

```text
https://dwmusichub.com
```

Suno callback URL:

```text
https://dwmusichub.com/api/suno/callback
```

Point the domain's `A` record to the VPS IPv4 address before deploying:

```text
dwmusichub.com -> 187.127.252.51
```

The sections below describe manual deployment if you are not using Hostinger's Docker project API.

Install Node.js 20+ and Nginx on the Hostinger VPS.

```bash
sudo apt update
sudo apt install -y nginx git
node --version
npm --version
```

If Node is missing or old, install a current LTS release before continuing.

## 2. Clone and Build

```bash
sudo mkdir -p /var/www
sudo chown -R "$USER":"$USER" /var/www
cd /var/www
git clone https://github.com/dpwebb/DWAnniversaryalbum.git anniversary-album-maker
cd anniversary-album-maker
npm ci
npm run build
```

## 3. Run the Production Server

Smoke test locally on the VPS:

```bash
PORT=3000 npm start
```

In another SSH session:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/api/suno/callbacks
```

## 4. Install as a systemd Service

```bash
sudo cp deploy/anniversary-album-maker.service.example /etc/systemd/system/anniversary-album-maker.service
sudo chown -R www-data:www-data /var/www/anniversary-album-maker
sudo systemctl daemon-reload
sudo systemctl enable anniversary-album-maker
sudo systemctl start anniversary-album-maker
sudo systemctl status anniversary-album-maker
```

## 5. Configure Nginx

Edit the example config and replace `your-domain.com` with the real domain pointed at the Hostinger VPS.

```bash
sudo cp deploy/nginx-anniversary-album-maker.conf.example /etc/nginx/sites-available/anniversary-album-maker
sudo nano /etc/nginx/sites-available/anniversary-album-maker
sudo ln -s /etc/nginx/sites-available/anniversary-album-maker /etc/nginx/sites-enabled/anniversary-album-maker
sudo nginx -t
sudo systemctl reload nginx
```

## 6. Enable HTTPS

Use Hostinger's SSL tooling if available, or install Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

## 7. Suno Callback URL

Once HTTPS is active, use this in the app's Suno callback URL field:

```text
https://your-domain.com/api/suno/callback
```

The app's `Use production callback` button sets the callback URL from the current browser origin, so it will work automatically when opened at the production domain.

## 8. Updating Production

```bash
cd /var/www/anniversary-album-maker
sudo -u www-data git pull
sudo -u www-data npm ci
sudo -u www-data npm run build
sudo systemctl restart anniversary-album-maker
```
