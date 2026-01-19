// Main entry point for the multi-agent platform

import 'dotenv/config';
import { initializeDatabase, closeDatabase } from './db/index.js';
import { Orchestrator } from './orchestrator/index.js';
import { SlackApp } from './slack/app.js';
import { loadConfig } from './config.js';

async function main() {
  console.log('[Main] Starting multi-agent platform...');

  // Load configuration
  const config = loadConfig();
  console.log('[Main] Configuration loaded');

  // Initialize database
  const db = await initializeDatabase({ path: config.database.path });
  console.log('[Main] Database initialized');

  // Create orchestrator
  const orchestrator = new Orchestrator(db, {
    llm: config.llm,
    context: config.context,
    classifier: {
      confidenceThreshold: 0.5,
      directRouteThreshold: 0.8
    }
  });
  console.log('[Main] Orchestrator created');

  // Create and start Slack app
  const slackApp = new SlackApp(config.slack, orchestrator);
  await slackApp.start();
  console.log('[Main] Slack app started');

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('[Main] Shutting down...');
    await slackApp.stop();
    closeDatabase();
    console.log('[Main] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Periodic context cleanup (every 5 minutes)
  setInterval(() => {
    const cleaned = orchestrator.cleanup();
    if (cleaned > 0) {
      console.log(`[Main] Cleaned up ${cleaned} expired contexts`);
    }
  }, 5 * 60 * 1000);

  console.log('[Main] Multi-agent platform is running');
}

main().catch((error) => {
  console.error('[Main] Fatal error:', error);
  process.exit(1);
});
