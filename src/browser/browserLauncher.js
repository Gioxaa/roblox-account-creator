import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { getExtensionPaths, isChromeLaunchable, addBrowserFingerprints, addAntiDetection } from './browserUtils.js';
import { getRandomUserAgent } from '../utils/helpers.js';

/**
 * Launch a browser instance with appropriate options
 * @param {Object} config - Configuration object
 * @param {Object} logger - Logger instance
 * @param {string} username - Username for profile directory
 * @param {string} proxy - Optional proxy to use
 * @returns {Promise<Object>} Browser and page objects
 */
export async function launchBrowser(config, logger, username, proxy = null) {
  let browser = null;
  let page = null;

  try {
    // Create a unique profile directory for this account if enabled
    let profileDir = null;
    if (config.useProfileDir !== false) {
      profileDir = path.join('./profiles', `profile_${username}`);
      try {
        if (!fs.existsSync(profileDir)) {
          fs.mkdirSync(profileDir, { recursive: true });
        }
      } catch (err) {
        logger.error(`Failed to create profile directory: ${err.message}`);
        profileDir = null;
      }
    }

    // Get extension paths if enabled
    const extensionPaths = config.useExtensions ? getExtensionPaths(config, logger) : [];
    
    // Launch options
    let launchOptions = {
      headless: config.headless !== undefined ? config.headless : false,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-web-security', // Allow cross-origin frames for better CAPTCHA handling
        '--disable-features=IsolateOrigins,site-per-process', // Disable site isolation
        '--disable-blink-features=AutomationControlled', // Hide automation flag
        '--user-agent=' + (config.randomUserAgents ? getRandomUserAgent() : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'),
        '--window-size=1280,800'
      ]
    };

    // Add user-data-dir if profile directory was created successfully
    if (profileDir) {
      launchOptions.args.push(`--user-data-dir=${profileDir}`);
    }

    // Add extensions if available
    if (extensionPaths.length > 0) {
      extensionPaths.forEach(extPath => {
        if (fs.existsSync(extPath)) {
          launchOptions.args.push(`--load-extension=${extPath}`);
        }
      });
    }

    // Check if we should use Chrome
    let useChrome = false;
    if (config.useChrome && config.chromePath) {
      useChrome = await isChromeLaunchable(config.chromePath, logger);
      if (useChrome) {
        launchOptions.executablePath = config.chromePath;
      } else {
        logger.log("Falling back to bundled Chromium");
      }
    }

    // Add proxy if available
    if (proxy) {
      launchOptions.args.push(`--proxy-server=${proxy}`);
      logger.log(`Using proxy ${proxy}`);
    }

    // Try launching with all options first
    try {
      logger.log(`Launching browser with full options`);
      browser = await puppeteer.launch(launchOptions);
    } catch (launchError) {
      logger.error(`Failed to launch browser with full options: ${launchError.message}`);
      
      // Try with minimal options as fallback
      logger.log("Attempting to launch browser with minimal options");
      launchOptions = {
        headless: config.headless !== undefined ? config.headless : false,
        defaultViewport: null,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security'
        ]
      };
      
      if (proxy) {
        launchOptions.args.push(`--proxy-server=${proxy}`);
      }
      
      browser = await puppeteer.launch(launchOptions);
      logger.log("Successfully launched browser with minimal options");
    }

    // Create a new page
    page = await browser.newPage();
    
    // Set timeout to 30s to avoid hanging
    page.setDefaultTimeout(30000);

    // Add browser fingerprints to avoid detection
    try {
      await addBrowserFingerprints(page);
      await addAntiDetection(page);
    } catch (e) {
      logger.error(`Error adding browser fingerprints: ${e.message}`);
      // Continue even if fingerprinting fails
    }

    return { browser, page };
  } catch (error) {
    // Clean up if there was an error
    if (browser) {
      await browser.close().catch(() => {});
    }
    throw error;
  }
} 