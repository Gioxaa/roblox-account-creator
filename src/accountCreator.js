import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { launchBrowser } from './browser/browserLauncher.js';
import { handleCaptcha } from './captcha/captchaHandler.js';
import { simulateHumanMouseMovement, typeHumanLike } from './browser/browserUtils.js';
import { delay, getRandomProxy } from './utils/helpers.js';
import os from 'os';

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
    const browserOptions = {
      headless: config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1280,720'
      ]
    };

    if (proxy) {
      browserOptions.args.push(`--proxy-server=${proxy}`);
      logger.log(`Worker ${workerNumber}: Using proxy: ${proxy}`);
    }

    if (config.useChrome && config.chromePath) {
      browserOptions.executablePath = config.chromePath;
      logger.log(`Worker ${workerNumber}: Using Chrome at: ${config.chromePath}`);
    }

    if (config.useProfileDir) {
      const profileDir = path.join(os.tmpdir(), `roblox_profile_${workerNumber}_${Date.now()}`);
      browserOptions.userDataDir = profileDir;
      logger.log(`Worker ${workerNumber}: Using profile directory: ${profileDir}`);
    }

    logger.log('Launching browser with full options');
    browser = await launchBrowser(browserOptions);
    page = await browser.newPage();

    // Set user agent
    if (config.randomUserAgents) {
      const userAgent = getRandomUserAgent();
      await page.setUserAgent(userAgent);
      logger.log(`Worker ${workerNumber}: Using user agent: ${userAgent}`);
    }

    // Set viewport
    await page.setViewport({ width: 1280, height: 720 });

    // Navigate to signup page
    await page.goto('https://www.roblox.com/', { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for the page to load
    await page.waitForSelector('input[id="signup-username"]', { visible: true, timeout: 10000 });

    // Fill in the form
    logger.log(`Worker ${workerNumber}: Filling in signup form for ${username}`);
    
    // Fill username with human-like typing
    await typeHumanLike(page, 'input[id="signup-username"]', username);
    
    // Fill password with human-like typing
    await typeHumanLike(page, 'input[id="signup-password"]', password);
    
    // Select birthday fields
    await page.select('select[id="MonthDropdown"]', config.birthMonth);
    await page.select('select[id="DayDropdown"]', config.birthDay);
    await page.select('select[id="YearDropdown"]', config.birthYear);
    
    // Random gender selection
    const genderOptions = await page.$$('button[id^="FemaleButton"], button[id^="MaleButton"]');
    if (genderOptions.length > 0) {
      const randomGender = genderOptions[Math.floor(Math.random() * genderOptions.length)];
      await clickHumanLike(page, randomGender);
    }
    
    // Take screenshot before signup
    if (config.verboseLog) {
      const screenshotPath = path.join('./logs', `before_signup_${username}_${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      logger.log(`Saved pre-signup screenshot to ${screenshotPath}`);
    }
    
    // Click the signup button
    const signupButton = await page.$('#signup-button');
    if (signupButton) {
      await clickHumanLike(page, signupButton);
      logger.log(`Worker ${workerNumber}: Clicked signup for ${username}`);
    } else {
      throw new Error('Signup button not found');
    }
    
    // Wait for captcha to appear
    await page.waitForFunction(() => {
      return document.querySelector('iframe[src*="arkoselabs"], iframe[src*="funcaptcha"], iframe[id="arkose-iframe"]') !== null;
    }, { timeout: 10000 }).catch(() => {
      logger.log(`Worker ${workerNumber}: No CAPTCHA iframe detected within timeout period`);
    });
    
    // Handle CAPTCHA
    const captchaSolved = await handleCaptcha(page, username, workerNumber, config, logger, rl);
    
    if (captchaSolved) {
      logger.log(`Worker ${workerNumber}: CAPTCHA solved successfully for ${username}`);
      
      // Wait for account creation verification
      logger.log(`Worker ${workerNumber}: Waiting for account creation verification...`);
      
      // Wait for redirect to home page
      try {
        // First wait for navigation to complete
        await page.waitForNavigation({ timeout: 30000 });
        
        // Check if we're on the home page
        const currentUrl = await page.url();
        if (currentUrl.includes('/home')) {
          // Check for "Finish Account Set Up" text
          const finishSetupText = await page.evaluate(() => {
            const element = document.querySelector('.font-header-1, h1');
            return element ? element.innerText : null;
          });
          
          if (finishSetupText && finishSetupText.includes('Finish Account Set Up')) {
            logger.log(`Worker ${workerNumber}: Account creation verified - found "Finish Account Set Up" text`);
            
            // Take a screenshot of the success page
            const screenshotPath = path.join('./logs', `success_${username}_${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: false });
            logger.log(`Saved success screenshot to ${screenshotPath}`);
            
            // Save account to output file
            const accountData = `${username}:${password}`;
            fs.appendFileSync(config.outputFile, accountData + '\n');
            
            logger.log(`Worker ${workerNumber}: Successfully created account ${username}`);
            return true;
          } else {
            logger.log(`Worker ${workerNumber}: Redirected to home page but "Finish Account Set Up" text not found`);
            
            // Still consider it a success if we're on the home page
            const screenshotPath = path.join('./logs', `partial_success_${username}_${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: false });
            logger.log(`Saved partial success screenshot to ${screenshotPath}`);
            
            // Save account to output file
            const accountData = `${username}:${password}`;
            fs.appendFileSync(config.outputFile, accountData + '\n');
            
            logger.log(`Worker ${workerNumber}: Account likely created successfully for ${username}`);
            return true;
          }
        } else {
          logger.error(`Worker ${workerNumber}: Not redirected to home page after CAPTCHA, current URL: ${currentUrl}`);
          
          // Take screenshot of the error page
          const screenshotPath = path.join('./logs', `error_${username}_${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false });
          logger.log(`Saved error screenshot to ${screenshotPath}`);
          
          return false;
        }
      } catch (error) {
        logger.error(`Worker ${workerNumber}: Error during account verification: ${error.message}`);
        
        // Take screenshot of the current state
        const screenshotPath = path.join('./logs', `error_${username}_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        logger.log(`Saved error screenshot to ${screenshotPath}`);
        
        return false;
      }
    } else {
      logger.error(`Worker ${workerNumber}: Failed to solve CAPTCHA for ${username}`);
      return false;
    }
  } catch (error) {
    logger.error(`Worker ${workerNumber}: Failed to create account ${username}: ${error.message}`);
    
    if (page) {
      try {
        const screenshotPath = path.join('./logs', `error_${username}_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        logger.log(`Saved error screenshot to ${screenshotPath}`);
      } catch (e) {
        logger.error(`Worker ${workerNumber}: Failed to save error screenshot: ${e.message}`);
      }
    }
    
    return false;
  } finally {
    rl.close();
    
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        logger.error(`Worker ${workerNumber}: Error closing browser: ${e.message}`);
      }
    }
  }
} 