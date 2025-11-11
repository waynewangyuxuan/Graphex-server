/**
 * Winston Logger Configuration
 * Provides structured logging throughout the application
 */

import winston from 'winston';
import { LOG_CONFIG, APP_CONFIG } from '../config/constants';

/**
 * Custom log format
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Console log format for development
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

/**
 * Winston logger instance
 */
export const logger = winston.createLogger({
  level: LOG_CONFIG.LEVEL,
  format: logFormat,
  defaultMeta: { service: 'graphex-api' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: APP_CONFIG.NODE_ENV === 'development' ? consoleFormat : logFormat,
    }),
  ],
});

/**
 * Add file transport in production
 */
if (APP_CONFIG.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: `${LOG_CONFIG.FILE_PATH}/error.log`,
      level: 'error',
    })
  );
  logger.add(
    new winston.transports.File({
      filename: `${LOG_CONFIG.FILE_PATH}/combined.log`,
    })
  );
}

/**
 * Stream for Morgan HTTP logger
 */
export const stream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};
