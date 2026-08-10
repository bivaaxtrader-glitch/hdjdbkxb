import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
dotenv.config();

console.log('🚀 Server process starting...');
import path from 'path';
import { createServer } from 'http';

// Prevent process crashes on external hosts from unhandled background library promises
process.on('unhandledRejection', (reason: any) => {
  console.warn('⚠️ Handled unhandledRejection:', reason?.message || reason);
});

process.on('uncaughtException', (err: any) => {
  console.warn('⚠️ Handled uncaughtException:', err?.message || err);
});

import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { initSocket } from './src/services/socketService';
import { startMarketEngine } from './src/services/marketEngine';
import { startMasterSimulation, seedMasterTraders } from './src/services/copyTradingService';
import { backupDatabase } from './src/db/backup';
import authRouter from './src/api/auth';
import apiRouter, { syncDatabaseFromFirestore } from './src/api/routes';
import tournamentRouter, { seedTournaments } from './src/api/tournament';
import logger from './src/lib/logger';

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  const PORT = 3000;
  const httpServer = createServer(app);

  // Bot & Exploit Blocker Middleware - RUN FIRST to protect resources
  const forbiddenPatterns = [
    /\.php$/i,
    /\.env$/i,
    /\.git/i,
    /wp-(admin|login|content|includes)/i,
    /xmlrpc\.php/i,
    /vapi/i,
    /cgi-bin/i,
    /\.jsp$/i,
    /\.asp$/i,
    /\.aspx$/i,
    /admin\/(login|setup|config)/i,
    /config\/(?:db|settings)(?!\/)/i,
    /shell/i,
    /backup/i,
    /dump/i,
    /myadmin/i,
    /phpmyadmin/i
  ];

  app.use((req: Request, res: Response, next: NextFunction) => {
    const isBotScan = forbiddenPatterns.some(pattern => pattern.test(req.path));
    if (isBotScan) {
      // Quietly block and avoid expensive logging/processing
      return res.status(403).send('Forbidden');
    }
    next();
  });

  // Health check endpoints
  app.get('/health', (req, res) => { res.status(200).send('OK'); });
  app.get('/api/health', (req, res) => { 
    res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development'
    }); 
  });

  // Security Middlewares
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
  
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(cookieParser());
  
  // Logging
  app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

  // Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10000, // Increased for dev/heavy use
    message: { error: 'Too many requests, please try again later.' }
  });
  app.use('/api/', limiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, // Increased for dev
    message: { error: 'Too many login/register attempts. Please try again after 15 minutes.' }
  });
  app.use('/api/auth/', authLimiter);

  // Initialize Socket.IO
  initSocket(httpServer);

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api', tournamentRouter);
  app.use('/api', apiRouter);

  // Catch-all for missing API endpoints to prevent returning HTML for API calls
  app.all('/api/*', (req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found', path: req.path });
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    console.log('📦 Initializing Vite middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log('✅ Vite middleware ready');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // SEO: robots.txt
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: https://market.bivaax.trade/sitemap.xml`);
  });

  // SEO: sitemap.xml
  app.get('/sitemap.xml', (req, res) => {
    res.type('application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://market.bivaax.trade/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://market.bivaax.trade/trade</loc>
    <changefreq>always</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://market.bivaax.trade/affiliate</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://market.bivaax.trade/login</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://market.bivaax.trade/register</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://market.bivaax.trade/docs</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://market.bivaax.trade/about-us</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>`);
  });

  // Centralized Error Handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    logger.error(`${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
    const status = err.status || 500;
    res.status(status).json({
      error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
    });
  });

  // Schedule Daily Backup (Every 24 hours)
  setInterval(backupDatabase, 24 * 60 * 60 * 1000);
  // backupDatabase(); // Disabled for faster startup

  // Set server timeout to 30 seconds to prevent hanging connections from exhausting resources
  httpServer.timeout = 30000;
  httpServer.keepAliveTimeout = 65000;
  httpServer.headersTimeout = 66000;
  
  // Monitor event loop lag to diagnose performance issues
  setInterval(() => {
    const start = Date.now();
    setImmediate(() => {
      const lag = Date.now() - start;
      if (lag > 200) {
        console.warn(`[PERF] Event loop lag detected: ${lag}ms`);
      }
    });
  }, 5000);

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Stagger startup tasks to keep the event loop responsive and avoid peak resource spikes
    setTimeout(async () => {
      console.log('🔄 Starting background synchronization and seeding...');
      
      // 1. Sync local database from Firestore (restores Users, Trades, etc.)
      try {
        await syncDatabaseFromFirestore();
      } catch (syncErr: any) {
        console.error('Failed to sync database from Firestore on boot:', syncErr.message);
      }

      // 2. Seed static data
      try {
        await seedMasterTraders();
        await seedTournaments();
      } catch (err) {}

      // 3. Start Market Engine (starts price generation ticker)
      setTimeout(() => {
        console.log('📈 Starting Market Engine...');
        startMarketEngine();
        
        // 4. Start Copy Trading Simulation
        setTimeout(() => {
          console.log('👥 Starting Copy Trading Simulation...');
          startMasterSimulation();
        }, 10000);
      }, 5000);
      
    }, 2000);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
