import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config.js';
import { ensureBaseData } from './db/base.js';
import { sessionLoader, csrfGuard, requireAuth } from './middleware/auth.js';
import { HttpError } from './middleware/validate.js';
import { rateLimit } from './security/rateLimit.js';
import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import priceRoutes from './routes/prices.js';
import productRoutes from './routes/products.js';
import saleRoutes from './routes/sales.js';
import purchaseRoutes from './routes/purchases.js';
import customerRoutes from './routes/customers.js';
import supplierRoutes from './routes/suppliers.js';
import repairRoutes from './routes/repairs.js';
import cashRoutes from './routes/cash.js';
import staffRoutes from './routes/staff.js';
import reportRoutes from './routes/reports.js';
import adminRoutes from './routes/admin.js';

export function createApp() {
  ensureBaseData();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'blob:'],
        'connect-src': ["'self'"],
        'frame-src': ['https://www.google.com', 'https://maps.google.com'],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': config.isProd ? [] : null,
      },
    },
    strictTransportSecurity: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));
  app.use((_req, res, next) => {
    res.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
    next();
  });
  app.use(compression({ filter: (req, res) => !req.path.endsWith('/stream') && compression.filter(req, res) }));
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));

  // Genel API hız sınırı
  app.use('/api', rateLimit({ windowMs: 60_000, max: config.isTest ? 100000 : 600 }));
  app.use('/api', sessionLoader, csrfGuard);
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/public', publicRoutes);
  app.use('/api/auth', authRoutes);

  const admin = express.Router();
  admin.use(requireAuth);
  admin.use('/prices', priceRoutes);
  admin.use('/products', productRoutes);
  admin.use('/sales', saleRoutes);
  admin.use('/purchases', purchaseRoutes);
  admin.use('/customers', customerRoutes);
  admin.use('/suppliers', supplierRoutes);
  admin.use('/repairs', repairRoutes);
  admin.use('/cash', cashRoutes);
  admin.use('/staff', staffRoutes);
  admin.use('/reports', reportRoutes);
  admin.use('/', adminRoutes);
  app.use('/api/admin', admin);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Bulunamadı' }));

  // Yüklenen görseller: yalnızca görsel olarak sunulur, çalıştırılamaz
  app.use('/uploads', express.static(config.uploadDir, {
    maxAge: '30d',
    immutable: true,
    setHeaders: (res) => {
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
    },
  }));

  // React arayüzü (derlenmiş)
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, {
      index: false,
      setHeaders: (res, file) => {
        if (file.endsWith('sw.js') || file.endsWith('.webmanifest')) res.set('Cache-Control', 'no-cache');
        else if (file.includes(`${path.sep}assets${path.sep}`)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }));
    const indexHtml = path.join(config.clientDist, 'index.html');
    app.get(/^\/(?!api|uploads).*/, (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }

  // Hata yönetimi — iç ayrıntılar istemciye sızdırılmaz
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError || (err.status && err.status < 500)) {
      return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
    }
    if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Dosya veya istek çok büyük' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Geçersiz JSON' });
    if (String(err.message).includes('UNIQUE constraint')) return res.status(409).json({ error: 'Bu kayıt zaten mevcut' });
    console.error('[hata]', req.method, req.originalUrl, err);
    res.status(500).json({ error: 'Beklenmeyen bir hata oluştu' });
  });

  return app;
}
