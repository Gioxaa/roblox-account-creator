import fs from 'fs';
import readline from 'readline';

/**
 * Delay execution for a specified time
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} A promise that resolves after the delay
 */
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generate a readable username with random characters
 * @param {string} base - Base name to use
 * @returns {string} Generated username
 */
export function generateReadableName(base) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const randStr = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const randNum = Math.floor(Math.random() * 999);
  return `${base}${randStr}${randNum}`;
}

/**
 * Generate a random email address
 * @returns {string} Random email address
 */
export function generateRandomEmail() {
  const domains = ['gmail.com', 'outlook.com', 'yahoo.com', 'protonmail.com'];
  const randomDomain = domains[Math.floor(Math.random() * domains.length)];
  const username = generateReadableName('user');
  return `${username}@${randomDomain}`;
}

/**
 * Get a random user agent string
 * @returns {string} Random user agent
 */
export function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.71 Safari/537.36 Edg/94.0.992.38'
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

/**
 * Load proxies from the proxies.txt file
 * @param {Object} logger - Logger instance
 * @returns {Array} List of proxies
 */
export function loadProxies(logger) {
  let proxies = [];
  try {
    if (fs.existsSync('./proxies.txt')) {
      proxies = fs.readFileSync('./proxies.txt', 'utf-8')
        .split('\n')
        .filter(line => line.trim() !== '')
        .map(line => line.trim());
      
      if (proxies.length > 0) {
        logger.log(`Loaded ${proxies.length} proxies`);
      }
    }
  } catch (error) {
    logger.error(`Failed to load proxies: ${error.message}`);
  }
  return proxies;
}

/**
 * Get a random proxy from the list
 * @param {Array} proxies - List of proxies
 * @param {Object} config - Configuration object
 * @returns {string|null} A random proxy or null if none available
 */
export function getRandomProxy(proxies, config) {
  if (proxies.length === 0 || !config.useProxies) {
    return null;
  }
  return proxies[Math.floor(Math.random() * proxies.length)];
}

/**
 * Create a readline interface for user input
 * @returns {Object} The readline interface
 */
export function createReadlineInterface() {
  const readline = require('readline');
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Wait for user to press Enter
 * @param {Object} rl - Readline interface
 * @returns {Promise} Promise that resolves when Enter is pressed
 */
export function waitForEnter(rl) {
  return new Promise(resolve => {
    rl.question('CAPTCHA completed? Press ENTER to continue...\n', () => {
      resolve();
    });
  });
} 