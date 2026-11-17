/**
 * backend/src/app.js
 * Express application configuration, static view middleware, and API routing
 */

const express = require('express');
const path = require('path');
const config = require('./config');
const apiRoutes = require('./routes');

const app = express();
const PUBLIC_DIR = path.resolve(__dirname, '../public');

// Body parsing middleware
app.use(express.json());

// Serve static frontend assets (HTML, CSS, JS dashboard)
app.use(express.static(PUBLIC_DIR));

// Dynamic middleware to serve recorded video files and transcripts
app.use('/recordings', (req, res, next) => {
  const downloadDir = config.getDownloadDir();
  express.static(downloadDir)(req, res, next);
});

// Mount all API endpoints
app.use('/api', apiRoutes);

// Fallback middleware to serve the dashboard SPA for non-API client routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/recordings')) {
    return res.status(404).json({ ok: false, error: 'Endpoint not found' });
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('[App Error]:', err.stack || err.message);
  res.status(err.status || 500).json({
    ok: false,
    error: err.message || 'Internal Server Error',
  });
});

module.exports = app;
