import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  handleCheckPaymentStatus,
  handleCreatePixPayment,
  handleMercadoPagoWebhook,
  handlePaymentsConfig,
} from './src/utils/mercadoPagoApi.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'hz-party-server' });
  });

  app.get('/api/payments/config', (_req, res) => {
    const result = handlePaymentsConfig(process.env);
    res.status(result.status).json(result.body);
  });

  app.post('/api/payments/pix', async (req, res) => {
    const result = await handleCreatePixPayment(req.body, process.env);
    res.status(result.status).json(result.body);
  });

  app.get('/api/payments/:paymentId', async (req, res) => {
    const result = await handleCheckPaymentStatus(
      req.params.paymentId,
      process.env
    );
    res.status(result.status).json(result.body);
  });

  app.post('/api/webhooks/mercadopago', async (req, res) => {
    const queryId =
      typeof req.query['data.id'] === 'string'
        ? req.query['data.id']
        : typeof req.query.id === 'string'
          ? req.query.id
          : undefined;
    const result = await handleMercadoPagoWebhook(
      req.body,
      queryId,
      process.env
    );
    res.status(result.status).json(result.body);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HZ PARTY server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
