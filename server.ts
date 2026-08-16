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
import { loadMarketSettings } from './src/services/marketService';
import { startMasterSimulation, seedMasterTraders } from './src/services/copyTradingService';
import { backupDatabase } from './src/db/backup';
import authRouter from './src/api/auth';
import apiRouter, { syncDatabaseFromFirestore, seedDefaultPages } from './src/api/routes';
import tournamentRouter, { seedTournaments } from './src/api/tournament';
import { startTournamentEngine } from './src/services/tournamentService';
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
    /\bconfig\/(?:db|settings)(?!\/)/i,
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

  // Health check endpoints
  app.get('/health', (req, res) => { res.status(200).send('OK'); });
  app.get('/api/health', (req, res) => { 
    res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development'
    }); 
  });
  
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

  // SEO: robots.txt (Served with high priority before wildcard handlers)
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(`User-agent: *

# Allow crawling of public pages & news
Allow: /$
Allow: /about-us$
Allow: /docs$
Allow: /news/
Allow: /page/

# Allow crawling of assets & bundles required for Google page rendering
Allow: /assets/
Allow: /public/
Allow: /images/
Allow: /favicon.jpg
Allow: /icon-512.png
Allow: /manifest.json

# Disallow authentication & private accounts
Disallow: /login
Disallow: /register
Disallow: /signup
Disallow: /trade
Disallow: /leaderboard
Disallow: /promotions
Disallow: /calendar
Disallow: /tournaments
Disallow: /education
Disallow: /statuses
Disallow: /help-center
Disallow: /support
Disallow: /profile
Disallow: /affiliate
Disallow: /signals
Disallow: /copytrading
Disallow: /crypto-deposit
Disallow: /mfs-deposit
Disallow: /deposit/
Disallow: /Bivaaxpay

# Disallow admin panels & sensitive support interfaces
Disallow: /admin
Disallow: /support-center

# Disallow all backend API endpoints & internal system logic
Disallow: /api/

# Specify the absolute URL to the sitemap
Sitemap: https://bivaax.com/sitemap.xml`);
  });

  // SEO: sitemap.xml (Served with high priority before wildcard handlers)
  app.get('/sitemap.xml', (req, res) => {
    res.type('application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
  <!-- Core Landing Pages -->
  <url>
    <loc>https://bivaax.com/</loc>
    <lastmod>2026-08-14</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://bivaax.com/about-us</loc>
    <lastmod>2026-08-14</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://bivaax.com/docs</loc>
    <lastmod>2026-08-14</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>

  <!-- News & Educational Articles (Dynamic) -->
  <url>
    <loc>https://bivaax.com/news/chart-basics</loc>
    <lastmod>2026-08-03</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://bivaax.com/news/chart-scale</loc>
    <lastmod>2026-08-03</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://bivaax.com/news/market-overview</loc>
    <lastmod>2026-08-03</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://bivaax.com/news/history-nav</loc>
    <lastmod>2026-08-03</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://bivaax.com/news/new-mechanics</loc>
    <lastmod>2026-08-03</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://bivaax.com/news/trend-analysis</loc>
    <lastmod>2026-08-03</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://bivaax.com/news/social-trading</loc>
    <lastmod>2026-08-03</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://bivaax.com/news/smart-signals</loc>
    <lastmod>2026-08-03</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://bivaax.com/news/crypto-profits</loc>
    <lastmod>2026-08-03</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://bivaax.com/news/deposit-bonus-50</loc>
    <lastmod>2026-08-06</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>

  <!-- Static Information & Legal Pages (Dynamic) -->
  <url>
    <loc>https://bivaax.com/page/contact</loc>
    <lastmod>2026-08-14</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://bivaax.com/page/legal-agreement</loc>
    <lastmod>2026-08-14</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://bivaax.com/page/risk-disclosure</loc>
    <lastmod>2026-08-14</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://bivaax.com/page/privacy-policy</loc>
    <lastmod>2026-08-14</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://bivaax.com/page/terms-of-service</loc>
    <lastmod>2026-08-14</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://bivaax.com/page/aml-policy</loc>
    <lastmod>2026-08-14</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://bivaax.com/page/payment-methods</loc>
    <lastmod>2026-08-14</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>`);
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    console.log('📦 Initializing Vite middleware...');
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        allowedHosts: true 
      },
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
        await seedDefaultPages();
        startTournamentEngine();
      } catch (err) {}

      // 3. Start Market Engine (starts price generation ticker)
      setTimeout(async () => {
        console.log('📈 Starting Market Engine...');
        await loadMarketSettings();
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
