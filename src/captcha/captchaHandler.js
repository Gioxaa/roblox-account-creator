import path from 'path';
import { delay } from '../utils/helpers.js';
import { solveCaptcha } from './captchaSolver.js';
import { monitorCaptchaStatus, extractRobloxDataExchangeBlob, monitorForRobloxArkoseIframe } from './captchaBase.js';

/**
 * Handle CAPTCHA detection and solving
 * @param {Object} page - Puppeteer page object
 * @param {string} username - Username for the account
 * @param {number} workerID - Worker ID for logging
 * @param {Object} config - Configuration object
 * @param {Object} logger - Logger instance
 * @param {Object} rl - Readline interface for manual solving
 * @returns {Promise<boolean>} Whether CAPTCHA was handled successfully
 */
export async function handleCaptcha(page, username, workerID, config, logger, rl) {
  try {
    // Check for CAPTCHA
    logger.log(`Worker ${workerID}: Checking for CAPTCHA for ${username}`);
    
    // First, let's get information about any CAPTCHA resources detected in the page
    const captchaDetails = {
      resources: [],
      iframeSrc: null,
      publicKey: null,
      sessionToken: null,
      blobData: null
    };
    
    // Extract CAPTCHA resources from the page
    const networkResources = await page.evaluate(() => {
      // Check all resources to find CAPTCHA related ones
      const resources = window.performance.getEntries()
        .filter(entry => 
          entry.name && (
            entry.name.includes('arkoselabs') || 
            entry.name.includes('funcaptcha') || 
            entry.name.includes('captcha')
          )
        )
        .map(entry => ({
          url: entry.name,
          type: entry.initiatorType || 'unknown'
        }));
        
      // Find any CAPTCHA iframes
      const iframes = Array.from(document.querySelectorAll('iframe'))
        .filter(iframe => 
          iframe.src && (
            iframe.src.includes('arkoselabs') || 
            iframe.src.includes('funcaptcha') ||
            iframe.src.includes('arkose') ||
            iframe.src.includes('roblox.com/arkose')
          )
        )
        .map(iframe => iframe.src);
        
      return { resources, iframes };
    });
    
    if (networkResources.resources && networkResources.resources.length > 0) {
      logger.log(`Found ${networkResources.resources.length} CAPTCHA-related network resources`);
      captchaDetails.resources = networkResources.resources;
    }
    
    if (networkResources.iframes && networkResources.iframes.length > 0) {
      logger.log(`Found ${networkResources.iframes.length} CAPTCHA-related iframes`);
      captchaDetails.iframeSrc = networkResources.iframes[0];
    }
    
    // If we found CAPTCHA details, attempt to solve
    if (captchaDetails.resources.length > 0 || captchaDetails.iframeSrc) {
      logger.log(`Worker ${workerID}: CAPTCHA detected for ${username}`);
      
      // Take a screenshot before solving
      if (config.verboseLog) {
        try {
          const screenshotPath = path.join('./logs', `before_captcha_${username}_${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: true });
          logger.log(`Saved pre-CAPTCHA screenshot to ${screenshotPath}`);
        } catch (e) {
          logger.error(`Failed to save pre-CAPTCHA screenshot: ${e.message}`);
        }
      }
      
      // Wait for CAPTCHA iframe to fully load
      logger.log("Waiting for CAPTCHA iframe to fully load...");
      await delay(3000);
      
      // Try to monitor for the Roblox arkose iframe to appear
      logger.log("Monitoring for Roblox arkose iframe...");
      const blobData = await monitorForRobloxArkoseIframe(page, 5000);
      if (blobData) {
        logger.log("Successfully found dataExchangeBlob from Roblox arkose iframe");
        captchaDetails.blobData = blobData;
      }
      
      // Check if we need to click a "Start Puzzle" or "Solve Puzzle" button first
      await page.evaluate(() => {
        try {
          // Look for buttons with text like "Start Puzzle", "Solve Puzzle", "Verify", etc.
          const buttonTexts = ['start puzzle', 'solve puzzle', 'verify', 'start challenge', 'solve challenge'];
          const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
          
          for (const button of buttons) {
            const text = button.textContent.toLowerCase().trim();
            if (buttonTexts.some(btnText => text.includes(btnText))) {
              console.log(`Found and clicking button: ${text}`);
              button.click();
              return `Clicked ${text} button`;
            }
          }
          
          // Look for elements with specific classes that might be clickable buttons
          const buttonSelectors = [
            '.captcha-solver',
            '.challenge-button',
            '.verification-button',
            '.puzzle-button',
            '[class*="captcha"] button',
            '[class*="challenge"] button',
            '[class*="verify"] button'
          ];
          
          for (const selector of buttonSelectors) {
            const element = document.querySelector(selector);
            if (element) {
              console.log(`Found and clicking element with selector: ${selector}`);
              element.click();
              return `Clicked element with selector: ${selector}`;
            }
          }
          
          return "No 'Start Puzzle' button found";
        } catch (e) {
          console.error("Error looking for 'Start Puzzle' button:", e);
          return null;
        }
      }).then(result => {
        if (result) logger.log(`Pre-solving action: ${result}`);
      }).catch(e => {
        logger.error(`Error in pre-solving action: ${e.message}`);
      });
      
      // Wait for CAPTCHA to initialize after clicking the button
      await delay(2000);
      
      // Try automatic solving if configured
      if (config.captchaSolve && config.captchaApiKey) {
        logger.log(`Worker ${workerID}: Attempting to solve CAPTCHA automatically for ${username}`);
        
        // Look for and initialize any visible CAPTCHA elements
        await page.evaluate(() => {
          try {
            // Check for any buttons labeled "start puzzle"
            const buttons = Array.from(document.querySelectorAll('button'));
            for (const button of buttons) {
              if (button.textContent && 
                  button.textContent.toLowerCase().includes('start puzzle')) {
                console.log("Found Start Puzzle button by text content");
                button.click();
                return "Clicked start puzzle button";
              }
            }
            
            // Find any captcha container that needs to be shown
            const containers = [
              document.querySelector('[class*="captcha-container"]'),
              document.querySelector('[id*="captcha"]'),
              document.querySelector('[class*="challenge"]'),
              document.querySelector('[id*="challenge"]')
            ].filter(Boolean);
            
            for (const container of containers) {
              console.log("Making CAPTCHA container visible");
              container.style.display = 'block';
              container.style.visibility = 'visible';
              container.style.opacity = '1';
            }
            
            return "Prepared CAPTCHA elements";
          } catch (e) {
            console.error("Error preparing CAPTCHA elements:", e);
            return null;
          }
        }).then(result => {
          if (result) logger.log(`CAPTCHA preparation result: ${result}`);
        }).catch(e => {
          logger.error(`Error in CAPTCHA preparation: ${e.message}`);
        });
        
        // Wait for CAPTCHA to initialize fully
        await delay(2000);
        
        // Try to solve the CAPTCHA with multiple attempts
        let solved = false;
        let attempts = 0;
        const maxAttempts = 3; // Try solving a few times
        
        while (!solved && attempts < maxAttempts) {
          attempts++;
          logger.log(`CAPTCHA solving attempt ${attempts}/${maxAttempts}`);
          
          try {
            // Try automatic solving with the updated details
            solved = await solveCaptcha(page, config.pageUrl, config.siteKey, config, logger);
            
            if (solved) {
              logger.log(`Worker ${workerID}: CAPTCHA appears to be solved automatically for ${username} on attempt ${attempts}`);
              
              // Wait for the site to process the token and verify the solution worked
              logger.log("Waiting for CAPTCHA verification...");
              await delay(5000);
              
              // Check if we need to click a submit button after solving
              const submitResult = await page.evaluate(() => {
                try {
                  // Look for buttons with text like "Submit", "Verify", "Continue", etc.
                  const buttonTexts = ['submit', 'verify', 'continue', 'done', 'complete', 'next'];
                  const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a.btn, div[role="button"]'));
                  
                  for (const button of buttons) {
                    const text = (button.textContent || button.value || '').toLowerCase().trim();
                    if (buttonTexts.some(btnText => text.includes(btnText))) {
                      console.log(`Found and clicking post-CAPTCHA button: ${text}`);
                      button.click();
                      return `Clicked ${text} button`;
                    }
                  }
                  
                  // Try common selectors for submit buttons
                  const submitSelectors = [
                    '.captcha-submit',
                    '.captcha-solver-button',
                    '.challenge-submit',
                    '.verification-submit',
                    '.btn-submit',
                    '.btn-verify',
                    '#signup-button',
                    'button[type="submit"]'
                  ];
                  
                  for (const selector of submitSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                      console.log(`Found and clicking submit element with selector: ${selector}`);
                      element.click();
                      return `Clicked element with selector: ${selector}`;
                    }
                  }
                  
                  return "No post-CAPTCHA submit button found";
                } catch (e) {
                  console.error("Error looking for post-CAPTCHA submit button:", e);
                  return null;
                }
              });
              
              logger.log(`Post-CAPTCHA action: ${submitResult}`);
              
              // Wait for the site to process the submission
              await delay(3000);
              
              // Check if we're still on the signup page or if we've moved on
              const currentUrl = await page.url();
              if (currentUrl.includes('/home') || !currentUrl.includes('signup')) {
                logger.log("CAPTCHA verification successful - redirected to new page");
                return true;
              }
              
              // Check if there are any success messages or if the CAPTCHA is gone
              const captchaStillPresent = await page.evaluate(() => {
                // Check if CAPTCHA elements are still visible
                const captchaElements = document.querySelectorAll(
                  'iframe[src*="arkoselabs"], iframe[src*="funcaptcha"], [class*="captcha"], [id*="captcha"]'
                );
                
                // Check for success messages
                const successElements = document.querySelectorAll(
                  '.signup-success, .success-message, [class*="success"]'
                );
                
                // Check for error messages
                const errorElements = document.querySelectorAll(
                  '.error-message, .captcha-failed, [class*="error"]'
                );
                
                return {
                  captchaPresent: captchaElements.length > 0,
                  successFound: successElements.length > 0,
                  errorFound: errorElements.length > 0,
                  errorMessages: Array.from(errorElements).map(el => el.textContent).join(', ')
                };
              });
              
              if (captchaStillPresent.errorFound) {
                logger.error(`CAPTCHA verification failed with error: ${captchaStillPresent.errorMessages}`);
                solved = false;
              } else if (!captchaStillPresent.captchaPresent || captchaStillPresent.successFound) {
                logger.log("CAPTCHA verification successful - CAPTCHA elements no longer visible");
                return true;
              } else {
                // If we're still here, the CAPTCHA might not have been properly verified
                logger.log("CAPTCHA may not have been properly verified, trying again...");
                solved = false;
              }
            }
          } catch (solveError) {
            logger.error(`CAPTCHA solving error on attempt ${attempts}: ${solveError.message}`);
            // Wait before trying again
            await delay(3000);
          }
        }
        
        // If automatic solving failed after all attempts, fall back to manual
        if (!solved) {
          logger.log(`Worker ${workerID}: Automatic solving failed after ${maxAttempts} attempts, falling back to manual for ${username}`);
        } else {
          return true;
        }
      }
      
      // Manual solving process
      logger.log(`Worker ${workerID}: Please solve the CAPTCHA manually for ${username}`);
      logger.log("INSTRUCTIONS: Solve the CAPTCHA in the browser window, then press ENTER in terminal");
      
      // Take a screenshot to help the user identify which browser window needs solving
      try {
        const screenshotPath = path.join('./logs', `manual_captcha_${username}_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        logger.log(`Saved manual CAPTCHA screenshot to ${screenshotPath} - Please check this image`);
      } catch (e) {
        logger.error(`Failed to save manual CAPTCHA screenshot: ${e.message}`);
      }
      
      await new Promise(resolve => {
        rl.question('CAPTCHA completed? Press ENTER to continue...\n', () => {
          resolve();
        });
      });
      
      // Wait after manual solving to ensure the site processes it
      logger.log(`Worker ${workerID}: Manual CAPTCHA completed, waiting for processing...`);
      await delay(5000);
      
      // Check if manual solving worked
      const currentUrl = await page.url();
      if (currentUrl.includes('/home') || !currentUrl.includes('signup')) {
        logger.log("Manual CAPTCHA verification successful - redirected to new page");
        return true;
      }
      
      // One more check for success
      const captchaStillPresent = await page.evaluate(() => {
        const captchaElements = document.querySelectorAll(
          'iframe[src*="arkoselabs"], iframe[src*="funcaptcha"], [class*="captcha"], [id*="captcha"]'
        );
        return captchaElements.length > 0;
      });
      
      if (!captchaStillPresent) {
        logger.log("Manual CAPTCHA verification successful - CAPTCHA elements no longer visible");
        return true;
      }
      
      logger.log("CAPTCHA may still be present after manual solving - continuing anyway");
      return true;
    } else {
      logger.log(`Worker ${workerID}: No CAPTCHA detected for ${username}`);
      return true;
    }
  } catch (error) {
    logger.error(`Worker ${workerID}: CAPTCHA handling error: ${error.message}`);
    return false;
  }
} 