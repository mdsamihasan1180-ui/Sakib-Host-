# SAKIB HOST

Real static HTML hosting platform with username/password authentication, SQLite, filesystem storage, version snapshots and Mini cPanel.

## Requirements
Node.js 18+ recommended.

## Install

```bash
npm install
cp .env.example .env
npm start
```

Open:

http://localhost:3000

## Local hosting test

A project named `portfolio` can be previewed at:

http://localhost:3000/portfolio/

The production subdomain format is:

https://portfolio.sakibhost.com

For production, set `HOSTING_DOMAIN=sakibhost.com`, point `*.sakibhost.com` DNS to the server, and use Nginx/Cloudflare/Let's Encrypt for TLS.

## API compatibility

Implemented:
- POST /register
- POST /login
- GET /logout
- GET /api/user
- POST /upload
- POST /api/delete
- POST /api/rename-project
- GET /api/download-version?project=...&v=...
- POST /api/restore-version
- GET /api/projects/:name/files
- GET /api/activity
- POST /api/change-password
- GET /api/domains
- POST /api/domains
- POST /api/projects

The old `https://ffx.qd.je` server is never contacted.

## Important production note

This application hosts static website files. Uploaded PHP/CGI/shell/executable files are blocked by default. Do not run uploaded code on the hosting server.

For real wildcard subdomains, DNS and a reverse proxy are required outside Node:
`*.sakibhost.com -> server IP`.

Set:
`PUBLIC_URL=https://sakibhost.com`
`HOSTING_DOMAIN=sakibhost.com`
`NODE_ENV=production`
and use a long random `SESSION_SECRET`.
