'use strict';

const http = require('node:http');

const notifications = [];
const PORT = Number(process.env.WEBHOOK_PORT || 5001);

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', notifications: notifications.length }));
    return;
  }

  if (req.method === 'GET' && req.url === '/notifications') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(notifications));
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/alerts')) {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const entry = { receivedAt: new Date().toISOString(), body: null };
      try {
        entry.body = JSON.parse(body);
      } catch (err) {
        entry.body = body;
      }
      notifications.push(entry);
      const alerts = (entry.body && entry.body.alerts) || [];
      for (const alert of alerts) {
        process.stdout.write(
          `${JSON.stringify({
            event: 'notification',
            status: alert.status,
            alertname: alert.labels && alert.labels.alertname,
            severity: alert.labels && alert.labels.severity,
            summary: alert.annotations && alert.annotations.summary,
            receivedAt: entry.receivedAt,
          })}\n`,
        );
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`webhook receiver listening on 0.0.0.0:${PORT}\n`);
});
