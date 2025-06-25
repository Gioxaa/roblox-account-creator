import fs from 'fs';
import path from 'path';

/**
 * Loads configuration from the config.json file
 * @returns {Object} The loaded configuration
 * @throws {Error} If the config file cannot be loaded
 */
function loadConfig() {
  try {
    const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
    return config;
  } catch (error) {
    console.error('Error loading config file:', error.message);
    process.exit(1);
  }
}

// Initialize config
const config = loadConfig();

export default config; 