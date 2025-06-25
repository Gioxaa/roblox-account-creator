import fs from 'fs';
import path from 'path';

// Create logs directory if it doesn't exist
const LOGS_DIR = './logs';
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR);
}

/**
 * Logger utility for console and file logging
 */
const logger = {
  /**
   * Log an informational message
   * @param {string} message - The message to log
   */
  log: (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    fs.appendFileSync(path.join(LOGS_DIR, 'app.log'), logMessage + '\n');
  },

  /**
   * Log an error message
   * @param {string} message - The error message to log
   */
  error: (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ERROR: ${message}`;
    console.error(logMessage);
    fs.appendFileSync(path.join(LOGS_DIR, 'error.log'), logMessage + '\n');
  }
};

export default logger; 