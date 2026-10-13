import { loadConfig } from './config.js';
import { logger } from './observability/logger.js';
import { createHttpApp } from './transport/http.js';

const config = loadConfig();
const app = createHttpApp(config, logger);

const httpServer = app.listen(config.port, config.host, () => {
  logger.info('server_started', {
    host: config.host,
    port: config.port,
    apiUrl: config.apiUrl,
  });
});

httpServer.on('error', (error) => {
  logger.error('server_error', { error: error.message });
  process.exitCode = 1;
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    logger.info('server_stopping', { signal });
    httpServer.close((error) => {
      if (error) {
        logger.error('server_stop_failed', { error: error.message });
        process.exitCode = 1;
      }
    });
  });
}
