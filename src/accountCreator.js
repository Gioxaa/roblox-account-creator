import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { launchBrowser } from './browser/browserLauncher.js';
import { handleCaptcha } from './captcha/captchaHandler.js';
import { simulateHumanMouseMovement, typeHumanLike } from './browser/browserUtils.js';
import { delay, getRandomProxy } from './utils/helpers.js';

/**
 * Create a Roblox account
 * @param {string} username - Username for the account
 * @param {string} password - Password for the account
 * @param {Object} config - Configuration object
 * @param {Object} logger - Logger instance
 * @param {Array} proxies - List of proxies
 * @param {number} workerNumber - Worker number for logging
 * @returns {Promise<boolean>} Whether account creation was successful
 */
export async function createAccount(username, password, config, logger, proxies, workerNumber = 0) {
  // Create readline interface for manual CAPTCHA solving
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const proxy = getRandomProxy(proxies, config);
  let browser = null;
  let page = null;

  try {
    logger.log(`Worker ${workerNumber}: Creating account ${username}`);
    
    // Launch browser
    const browserData = await launchBrowser(config, logger, username, proxy);
    browser = browserData.browser;
    page = browserData.page;

    // Enable request interception to find CAPTCHA resources
    try {
      await page.setRequestInterception(true);
    } catch (e) {
      logger.error(`Error setting up request interception: ${e.message}`);
    }
    
    // Track CAPTCHA-related resources
    const captchaResources = [];
    
    page.on('request', request => {
      try {
        const url = request.url();
        if (url.includes('funcaptcha') || url.includes('arkoselabs')) {
          captchaResources.push(url);
          logger.log(`CAPTCHA resource detected: ${url}`);
        }
        request.continue();
      } catch (e) {
        // If there's an error continuing the request, try to continue anyway
        try {
          request.continue();
        } catch (innerError) {
          // If we can't continue, try to abort
          try {
            request.abort();
          } catch (finalError) {
            // At this point, we've tried everything
            logger.error(`Request handling completely failed: ${finalError.message}`);
          }
        }
      }
    });

    // Add random delays to simulate human behavior
    await page.setViewport({
      width: 1280 + Math.floor(Math.random() * 100),
      height: 800 + Math.floor(Math.random() * 100)
    });

    await page.goto(config.pageUrl, { waitUntil: 'networkidle2' });

    // Simulate some random scrolling like a human
    await page.evaluate(() => {
      const scrollAmount = Math.floor(Math.random() * 100);
      window.scrollBy(0, scrollAmount);
      
      // Add a small delay
      return new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
    });

    // Set birthday info with human-like interactions
    await page.waitForSelector('#MonthDropdown');
    await simulateHumanMouseMovement(page, '#MonthDropdown');
    await page.select('#MonthDropdown', config.birthMonth);
    await delay(500 + Math.random() * 500);
    
    await simulateHumanMouseMovement(page, '#DayDropdown');
    await page.select('#DayDropdown', config.birthDay);
    await delay(500 + Math.random() * 500);
    
    await simulateHumanMouseMovement(page, '#YearDropdown');
    await page.select('#YearDropdown', config.birthYear);
    await delay(1000 + Math.random() * 1000);

    // Fill credentials with human-like typing
    await simulateHumanMouseMovement(page, '#signup-username');
    await typeHumanLike(page, '#signup-username', username);
    await delay(500 + Math.random() * 500);
    
    await simulateHumanMouseMovement(page, '#signup-password');
    await typeHumanLike(page, '#signup-password', password);

    // Wait for signup button to be enabled
    await page.waitForFunction(() => {
      const btn = document.querySelector('#signup-button');
      return btn && !btn.disabled;
    }, { timeout: 10000 });
    
    await delay(1000 + Math.random() * 1000);
    
    // Take screenshot before clicking signup
    if (config.verboseLog) {
      try {
        const screenshotPath = path.join('./logs', `before_signup_${username}_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath });
        logger.log(`Saved pre-signup screenshot to ${screenshotPath}`);
      } catch (e) {
        logger.error(`Failed to save pre-signup screenshot: ${e.message}`);
      }
    }
    
    // Click the signup button with human-like movement
    await simulateHumanMouseMovement(page, '#signup-button');
    await page.click('#signup-button');
    logger.log(`Worker ${workerNumber}: Clicked signup for ${username}`);

    // Use a more aggressive approach to detect CAPTCHA
    try {
      // Wait a short time to ensure any CAPTCHA elements have time to load
      await delay(2000);
      
      // Check DOM for CAPTCHA elements - this is more aggressive than waiting for specific selectors
      const captchaDetected = await page.evaluate(() => {
        // Check for any elements related to CAPTCHA
        const pageContent = document.documentElement.innerHTML.toLowerCase();
        const captchaKeywords = ['captcha', 'funcaptcha', 'arkose', 'puzzle', 'verification', 'verify', 'challenge'];
        
        // Check if any CAPTCHA-related keywords are in the page content
        for (const keyword of captchaKeywords) {
          if (pageContent.includes(keyword)) {
            return `Found CAPTCHA keyword: ${keyword}`;
          }
        }
        
        // Check for CAPTCHA-related elements
        const captchaSelectors = [
          'iframe[src*="arkoselabs"]',
          'iframe[src*="funcaptcha"]',
          'div[class*="captcha"]',
          'div[id*="captcha"]',
          'div[class*="challenge"]',
          'div[id*="challenge"]',
          'button[aria-label="Start Puzzle"]',
          '.modal-backdrop' // Often used when CAPTCHA is shown in a modal
        ];
        
        for (const selector of captchaSelectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            return `Found CAPTCHA element with selector: ${selector}, count: ${elements.length}`;
          }
        }
        
        return false;
      });
      
      if (captchaDetected) {
        logger.log(`Worker ${workerNumber}: CAPTCHA detected via DOM scan: ${captchaDetected}`);
        
        // If we've detected a CAPTCHA through DOM scan, handle it
        await handleCaptcha(page, username, workerNumber, config, logger, rl);
      } else if (captchaResources.length > 0) {
        logger.log(`Worker ${workerNumber}: CAPTCHA detected via network requests`);
        await handleCaptcha(page, username, workerNumber, config, logger, rl);
      } else {
        logger.log(`Worker ${workerNumber}: No CAPTCHA detected immediately after signup, continuing to monitor...`);
      }
    } catch (e) {
      logger.error(`Worker ${workerNumber}: Error during aggressive CAPTCHA detection: ${e.message}`);
    }
    
    // Check if account creation was successful (wait for redirect or success element)
    logger.log(`Worker ${workerNumber}: Waiting for account creation verification...`);
    await page.waitForFunction(
      () => window.location.href.includes('/home') || document.querySelector('.signup-success-container') !== null, 
      { timeout: 15000 }
    ).catch(() => {
      throw new Error('Account creation verification timed out');
    });
    
    // Take screenshot after verification
    if (config.verboseLog) {
      try {
        const screenshotPath = path.join('./logs', `success_${username}_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath });
        logger.log(`Saved success screenshot to ${screenshotPath}`);
      } catch (e) {
        logger.error(`Failed to save success screenshot: ${e.message}`);
      }
    }
    
    // Save the successful account
    fs.appendFileSync(config.outputFile, `${username}:${password}\n`);
    logger.log(`Worker ${workerNumber}: Successfully created account ${username}`);
    
    // Close readline interface
    rl.close();
    
    return true;
  } catch (error) {
    logger.error(`Worker ${workerNumber}: Failed to create account ${username}: ${error.message}`);
    
    // Take a screenshot of failure state if possible
    try {
      if (page) {
        const screenshotPath = path.join('./logs', `error_${username}_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath });
        logger.log(`Saved error screenshot to ${screenshotPath}`);
      }
    } catch (e) {
      // Screenshot failed, just log it
      logger.error(`Failed to save error screenshot: ${e.message}`);
    }
    
    // Close readline interface
    rl.close();
    
    return false;
  } finally {
    // Clean up even if there's an error
    try {
      if (page) {
        await page.setRequestInterception(false).catch(() => {});
      }
    } catch (e) {
      // Ignore errors during cleanup
    }
    
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
} 