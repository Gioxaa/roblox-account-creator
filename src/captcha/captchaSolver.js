import fetch from 'node-fetch';
import { delay } from '../utils/helpers.js';
import { extractRobloxCaptchaData } from './captchaExtractor.js';
import { extractDataExchangeBlob, extractRobloxDataExchangeBlob, monitorForRobloxArkoseIframe } from './captchaBase.js';

/**
 * Inject FunCaptcha token into the page
 * @param {Object} page - Puppeteer page object
 * @param {string} token - CAPTCHA token
 * @param {Object} logger - Logger instance
 * @returns {Promise<boolean>} Whether token injection was successful
 */
export async function injectFunCaptchaToken(page, token, logger) {
  try {
    logger.log("Injecting FunCaptcha token into page");
    logger.log(`Token value: ${token.substring(0, 20)}...`);
    
    // First try the Roblox-specific ArkoseLabs token injection
    const arkoseResult = await page.evaluate((token) => {
      try {
        // Method 1: Try Roblox specific captcha token handling
        if (window.Roblox && window.Roblox.FunCaptcha) {
          console.log("Found Roblox.FunCaptcha object, attempting to use it");
          
          // First check if there's a specific method for setting the token
          if (typeof window.Roblox.FunCaptcha.setToken === 'function') {
            window.Roblox.FunCaptcha.setToken(token);
            console.log("Set token via Roblox.FunCaptcha.setToken");
            return "Set token via Roblox.FunCaptcha.setToken";
          }
          
          // Check for any other token-setting methods
          const possibleMethods = [
            'setTokenResponse', 
            'setFunCaptchaToken', 
            'submitToken', 
            'onCaptchaSuccess'
          ];
          
          for (const methodName of possibleMethods) {
            if (typeof window.Roblox.FunCaptcha[methodName] === 'function') {
              console.log(`Found method Roblox.FunCaptcha.${methodName}, calling it`);
              window.Roblox.FunCaptcha[methodName](token);
              return `Set token via Roblox.FunCaptcha.${methodName}`;
            }
          }
          
          // Try to set the token in the Roblox FunCaptcha object
          window.Roblox.FunCaptcha.token = token;
          console.log("Set token via Roblox.FunCaptcha.token property");
          
          // Also try to trigger any onSuccess callbacks
          if (typeof window.Roblox.FunCaptcha.onSuccess === 'function') {
            window.Roblox.FunCaptcha.onSuccess(token);
            console.log("Called Roblox.FunCaptcha.onSuccess");
          }
          
          return "Set token via Roblox.FunCaptcha.token property";
        }
        
        // Method 2: Direct token injection to ArkoseLabs
        if (window.arkose && window.arkose.setTokenResponse) {
          console.log("Found arkose object, setting token directly");
          window.arkose.setTokenResponse(token);
          return "Set token via arkose.setTokenResponse";
        }
        
        // Method 3: Find the funcaptcha iframe and send message
        const funcaptchaIframe = document.querySelector('iframe[src*="arkoselabs"]');
        if (funcaptchaIframe) {
          console.log("Found funcaptcha iframe, sending postMessage");
          funcaptchaIframe.contentWindow.postMessage({ token }, '*');
          return "Set token via iframe postMessage";
        }
        
        // Method 4: Try to find the fc-token input field
        const fcTokenInput = document.querySelector('input[name="fc-token"]');
        if (fcTokenInput) {
          console.log("Found fc-token input, setting value");
          fcTokenInput.value = token;
          
          // Dispatch change event
          const event = new Event('change', { bubbles: true });
          fcTokenInput.dispatchEvent(event);
          return "Set token via fc-token input";
        }
        
        // Method 5: Try to find the FunCaptcha-Token input field
        const funcaptchaTokenInput = document.querySelector('input[name="FunCaptcha-Token"]');
        if (funcaptchaTokenInput) {
          console.log("Found FunCaptcha-Token input, setting value");
          funcaptchaTokenInput.value = token;
          
          // Dispatch change event
          const event = new Event('change', { bubbles: true });
          funcaptchaTokenInput.dispatchEvent(event);
          return "Set token via FunCaptcha-Token input";
        }
        
        // Method 6: Try to find any input with name containing captcha
        const captchaInput = document.querySelector('input[name*="captcha" i]');
        if (captchaInput) {
          console.log("Found captcha input, setting value");
          captchaInput.value = token;
          
          // Dispatch change event
          const event = new Event('change', { bubbles: true });
          captchaInput.dispatchEvent(event);
          return "Set token via captcha input";
        }
        
        // Method 7: For Roblox specifically, try to find the captcha token field
        const robloxCaptchaTokenField = document.querySelector('#captcha-token');
        if (robloxCaptchaTokenField) {
          console.log("Found Roblox captcha-token field, setting value");
          robloxCaptchaTokenField.value = token;
          
          // Dispatch change event
          const event = new Event('change', { bubbles: true });
          robloxCaptchaTokenField.dispatchEvent(event);
          return "Set token via Roblox captcha-token field";
        }
        
        // Method 8: Create a global variable for the token that can be accessed
        window.funcaptchaToken = token;
        console.log("Created global funcaptchaToken variable");
        
        // Method 9: Try to find and trigger the verification callback
        if (window.verifyCallback) {
          console.log("Found verifyCallback, calling it");
          window.verifyCallback(token);
          return "Called verifyCallback with token";
        }
        
        // Method 10: Roblox specific - try to find the arkose frame and set the token
        const arkoseFrame = document.getElementById('arkose-iframe');
        if (arkoseFrame) {
          console.log("Found arkose-iframe, trying to access contentWindow");
          try {
            arkoseFrame.contentWindow.postMessage({ token: token }, '*');
            console.log("Posted message to arkose-iframe contentWindow");
            return "Posted message to arkose-iframe contentWindow";
          } catch (e) {
            console.error("Error posting message to arkose-iframe:", e);
          }
        }
        
        // Method 11: Try to find any verification callbacks in the global scope
        for (const key in window) {
          if (typeof window[key] === 'function' && 
              (key.toLowerCase().includes('captcha') || 
               key.toLowerCase().includes('verify') || 
               key.toLowerCase().includes('token'))) {
            try {
              console.log(`Found potential callback function: ${key}`);
              window[key](token);
              return `Called potential callback function: ${key}`;
            } catch (e) {
              console.error(`Error calling ${key}:`, e);
            }
          }
        }
        
        // Method 12: Try to find any hidden input fields that might be related to captcha
        const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
        for (const input of hiddenInputs) {
          if (input.name && (
              input.name.toLowerCase().includes('captcha') || 
              input.name.toLowerCase().includes('token') || 
              input.name.toLowerCase().includes('arkose')
          )) {
            console.log(`Found hidden input field: ${input.name}`);
            input.value = token;
            
            // Dispatch change event
            const event = new Event('change', { bubbles: true });
            input.dispatchEvent(event);
            return `Set token via hidden input field: ${input.name}`;
          }
        }
        
        // Method 13: Try to set the token in the document as a data attribute
        document.documentElement.setAttribute('data-funcaptcha-token', token);
        console.log("Set token as data-funcaptcha-token attribute on document");
        
        return "No suitable injection method found, but tried multiple approaches";
      } catch (error) {
        return `Error injecting token: ${error.message}`;
      }
    }, token);
    
    logger.log(`Arkose token injection result: ${arkoseResult}`);
    
    // Now try to submit the form if there's a submit button
    const submitResult = await page.evaluate(() => {
      try {
        // Find submit button by various selectors
        const submitButton = 
          document.querySelector('button[type="submit"]') || 
          document.querySelector('input[type="submit"]') ||
          document.querySelector('button.signup-button') ||
          document.querySelector('#signup-button') ||
          document.querySelector('button.btn-primary') ||
          document.querySelector('button.btn-signup') ||
          document.querySelector('button[id*="signup" i]') ||
          document.querySelector('button[class*="signup" i]') ||
          // Add more specific selectors for Roblox
          document.querySelector('.captcha-solver-button') ||
          document.querySelector('.captcha-submit') ||
          document.querySelector('.challenge-submit');
        
        if (submitButton) {
          console.log(`Found submit button: ${submitButton.textContent || submitButton.value || 'unnamed button'}`);
          submitButton.click();
          return "Clicked submit button";
        }
        
        // Look for any button that might be related to CAPTCHA submission
        const allButtons = Array.from(document.querySelectorAll('button'));
        for (const button of allButtons) {
          const buttonText = button.textContent.toLowerCase();
          if (buttonText.includes('verify') || 
              buttonText.includes('submit') || 
              buttonText.includes('continue') ||
              buttonText.includes('next')) {
            console.log(`Clicking potential CAPTCHA submit button: ${buttonText}`);
            button.click();
            return `Clicked button with text: ${buttonText}`;
          }
        }
        
        // Try to submit any form that might be related to captcha
        const forms = document.querySelectorAll('form');
        for (const form of forms) {
          if (form.innerHTML.toLowerCase().includes('captcha') || 
              form.action.toLowerCase().includes('captcha') ||
              form.id.toLowerCase().includes('captcha')) {
            console.log("Found and submitting captcha-related form");
            form.submit();
            return "Submitted captcha-related form";
          }
        }
        
        // If we have a signup form, try to submit it
        const signupForm = document.querySelector('form[id*="signup" i], form[action*="signup" i]');
        if (signupForm) {
          console.log("Found and submitting signup form");
          signupForm.submit();
          return "Submitted signup form";
        }
        
        return "No submit button or form found";
      } catch (error) {
        return `Error submitting form: ${error.message}`;
      }
    });
    
    logger.log(`Form submission result: ${submitResult}`);
    
    return arkoseResult.includes("Set token") || 
           arkoseResult.includes("Called") || 
           arkoseResult.includes("Posted") || 
           submitResult.includes("Clicked") || 
           submitResult.includes("Submitted");
  } catch (error) {
    logger.error(`Error injecting FunCaptcha token: ${error.message}`);
    return false;
  }
}

/**
 * Solve Roblox FunCaptcha using 2captcha
 * @param {string} apiKey - 2captcha API key
 * @param {string} siteKey - FunCaptcha site key
 * @param {string} blobData - Optional blob data
 * @param {Object} logger - Logger instance
 * @returns {Promise<string>} CAPTCHA token
 */
export async function solveRobloxFunCaptcha(apiKey, siteKey, blobData = null, logger) {
  try {
    logger.log("Starting Roblox FunCaptcha solution with 2captcha");
    
    // Step 1: Send the CAPTCHA to 2captcha
    const in2captchaUrl = "https://2captcha.com/in.php";
    
    // Prepare the parameters according to 2captcha documentation for Roblox FunCaptcha
    const formData = new URLSearchParams();
    formData.append('key', apiKey);
    formData.append('method', 'funcaptcha');
    formData.append('publickey', siteKey);
    formData.append('surl', 'https://roblox-api.arkoselabs.com');
    formData.append('pageurl', 'https://www.roblox.com/');
    formData.append('json', '1');
    
    // Add additional parameters specific to Roblox
    if (blobData) {
      formData.append('data[blob]', blobData);
      logger.log(`Using blob data for CAPTCHA solving: ${blobData.substring(0, 30)}...`);
      
      // Also set the specific subdomain for Roblox
      formData.append('subdomain', 'roblox-api.arkoselabs.com');
    } else {
      formData.append('data[blob]', '');
      logger.log("No blob data available, attempting to solve without it");
    }
    
    // Add user agent and other parameters that might help
    formData.append('userAgent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36');
    formData.append('soft_id', 'puppeteer');
    
    logger.log(`Sending Roblox FunCaptcha request to 2captcha: ${formData.toString()}`);
    
    const submitResponse = await fetch(in2captchaUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    let submitResult;
    try {
      const responseText = await submitResponse.text();
      logger.log(`2captcha raw response: ${responseText}`);
      
      // Try to parse as JSON
      try {
        submitResult = JSON.parse(responseText);
      } catch (e) {
        // If it's not JSON, check if it starts with OK|
        if (responseText.startsWith('OK|')) {
          submitResult = {
            status: 1,
            request: responseText.substring(3)
          };
        } else {
          throw new Error(`2captcha API error: ${responseText}`);
        }
      }
    } catch (error) {
      throw new Error(`Error parsing 2captcha response: ${error.message}`);
    }
    
    if (!submitResult || submitResult.status !== 1) {
      throw new Error(`2captcha error: ${submitResult?.request || 'Unknown error'}`);
    }
    
    const captchaId = submitResult.request;
    logger.log(`CAPTCHA submitted successfully, got ID: ${captchaId}`);
    
    // Step 2: Wait and then get the result
    // Wait initial recommended time before first check
    logger.log("Waiting 20 seconds before checking for results...");
    await delay(20000);
    
    const maxAttempts = 15; // Increase the number of attempts
    const checkInterval = 5000; // Check every 5 seconds
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      logger.log(`Checking CAPTCHA solution status (attempt ${attempt}/${maxAttempts})...`);
      
      const res2captchaUrl = `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${captchaId}&json=1`;
      
      const resultResponse = await fetch(res2captchaUrl);
      let resultData;
      
      try {
        const resultText = await resultResponse.text();
        logger.log(`2captcha raw result: ${resultText}`);
        
        try {
          resultData = JSON.parse(resultText);
        } catch (e) {
          // If it's not JSON, check if it starts with OK|
          if (resultText.startsWith('OK|')) {
            resultData = {
              status: 1,
              request: resultText.substring(3)
            };
          } else {
            throw new Error(`2captcha API error: ${resultText}`);
          }
        }
      } catch (error) {
        logger.error(`Error parsing 2captcha result: ${error.message}`);
        await delay(checkInterval);
        continue;
      }
      
      if (resultData.status === 1) {
        // Success - we have the token
        const token = resultData.request;
        logger.log(`CAPTCHA solved successfully! Token: ${token.substring(0, 20)}...`);
        return token;
      } else if (resultData.request === "CAPCHA_NOT_READY") {
        // CAPTCHA is still being solved
        logger.log("CAPTCHA still being solved, waiting...");
        await delay(checkInterval); // Wait before checking again
        continue;
      } else {
        // Error
        throw new Error(`2captcha error: ${resultData.request}`);
      }
    }
    
    throw new Error("Failed to get CAPTCHA solution after maximum attempts");
  } catch (error) {
    logger.error(`Roblox FunCaptcha solution error: ${error.message}`);
    throw error;
  }
}

/**
 * Solve Roblox-specific FunCaptcha
 * @param {Object} page - Puppeteer page object
 * @param {Object} config - Configuration object
 * @param {Object} logger - Logger instance
 * @returns {Promise<boolean>} Whether solving was successful
 */
export async function solveRobloxSpecificFunCaptcha(page, config, logger) {
  try {
    logger.log("Starting Roblox-specific FunCaptcha solution");
    
    // First, try to extract the dataExchangeBlob using the new Roblox-specific method
    let blobData = null;
    if (config.funcaptchaOptions && config.funcaptchaOptions.autoParseBlob) {
      // Try to monitor for the iframe to appear and extract the blob
      logger.log("Monitoring for Roblox arkose iframe to appear...");
      blobData = await monitorForRobloxArkoseIframe(page, 5000);
      
      // If that fails, try the Roblox-specific method
      if (!blobData) {
        blobData = await extractRobloxDataExchangeBlob(page);
      }
      
      // If that fails, fall back to the general method
      if (!blobData) {
        blobData = await extractDataExchangeBlob(page);
      }
      
      if (blobData) {
        logger.log(`Found dataExchangeBlob for Roblox-specific FunCaptcha solution`);
      } else {
        logger.log("Could not find dataExchangeBlob, will attempt to solve without it");
      }
    }
    
    // Extract the CAPTCHA details from the page
    const captchaDetails = await page.evaluate(() => {
      try {
        // Method 1: Try to get data from ArkoseLabs iframe
        const arkoseFrame = document.querySelector('iframe[src*="arkoselabs"], iframe[id="arkose-iframe"], iframe[title="Challenge"]');
        if (arkoseFrame) {
          const src = arkoseFrame.src;
          const url = new URL(src);
          
          // Extract public key from iframe URL
          let publicKey = null;
          if (url.hash) {
            const hashParts = url.hash.substring(1).split('&');
            if (hashParts.length > 0) {
              publicKey = hashParts[0];
            }
          }
          
          // Try to extract publicKey from URL parameters
          if (!publicKey) {
            publicKey = url.searchParams.get('publicKey') || url.searchParams.get('pk');
          }
          
          // Extract dataExchangeBlob if available
          const dataExchangeBlob = url.searchParams.get('dataExchangeBlob');
          
          // Extract subdomain
          const subdomain = url.hostname;
          
          return {
            publicKey,
            subdomain,
            dataExchangeBlob,
            found: "iframe",
            src: arkoseFrame.src
          };
        }
        
        // Method 2: Try to get data from data attributes
        const captchaDiv = document.querySelector('div[data-sitekey]') || 
                          document.querySelector('div[data-pkey]');
        
        if (captchaDiv) {
          const publicKey = captchaDiv.getAttribute('data-sitekey') || 
                           captchaDiv.getAttribute('data-pkey');
          
          return {
            publicKey,
            found: "div"
          };
        }
        
        // Method 3: Try to find the key in the DOM
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const content = script.textContent || '';
          
          // Look for patterns like "public_key": "XXXXXXX" or sitekey: "XXXXXXX"
          const keyMatch = content.match(/["']public[_]?key["']\s*:\s*["']([A-Z0-9\-]+)["']/) || 
                          content.match(/["']sitekey["']\s*:\s*["']([A-Z0-9\-]+)["']/);
          
          if (keyMatch && keyMatch[1]) {
            return {
              publicKey: keyMatch[1],
              found: "script"
            };
          }
        }
        
        // Method 4: Try to find the key in network requests
        const fcTokenInput = document.querySelector('input[name="fc-token"]');
        if (fcTokenInput) {
          const value = fcTokenInput.value;
          if (value) {
            const pkMatch = value.match(/pk=([A-Z0-9\-]+)/);
            if (pkMatch && pkMatch[1]) {
              return {
                publicKey: pkMatch[1],
                found: "fc-token"
              };
            }
          }
        }
        
        // Method 5: Use a hardcoded key for Roblox
        return {
          publicKey: "A2A14B1D-1AF3-C791-9BBC-EE33C7C70A6F",
          subdomain: "roblox-api.arkoselabs.com",
          found: "hardcoded"
        };
      } catch (error) {
        console.error("Error extracting CAPTCHA details:", error);
        return {
          publicKey: "A2A14B1D-1AF3-C791-9BBC-EE33C7C70A6F",
          subdomain: "roblox-api.arkoselabs.com",
          found: "hardcoded-fallback"
        };
      }
    });
    
    logger.log(`Found CAPTCHA details: ${JSON.stringify(captchaDetails)}`);
    
    // Get the API key
    const apiKey = config.captchaServices['2captcha'].apiKey || config.captchaApiKey;
    if (!apiKey) {
      logger.error("No 2captcha API key found");
      return false;
    }
    
    // Get the user agent
    const userAgent = await page.evaluate(() => navigator.userAgent);
    
    // Solve the CAPTCHA
    const token = await solveRobloxFunCaptcha(apiKey, captchaDetails.publicKey || config.siteKey, blobData, logger);
    
    // Inject the token into the page
    const injected = await injectFunCaptchaToken(page, token, logger);
    return injected;
  } catch (error) {
    logger.error(`Roblox-specific FunCaptcha solution error: ${error.message}`);
    return false;
  }
}

/**
 * Main CAPTCHA solving function
 * @param {Object} page - Puppeteer page object
 * @param {string} siteUrl - URL of the page
 * @param {string} siteKey - CAPTCHA site key
 * @param {Object} config - Configuration object
 * @param {Object} logger - Logger instance
 * @returns {Promise<boolean>} Whether solving was successful
 */
export async function solveCaptcha(page, siteUrl, siteKey, config, logger) {
  if (!config.captchaSolve) {
    logger.log("Automatic CAPTCHA solving is disabled");
    return false;
  }

  try {
    logger.log(`Attempting to solve CAPTCHA automatically with ${config.captchaService} API`);
    
    // Check if this is a Roblox page
    const isRobloxPage = siteUrl.includes('roblox.com') || await page.evaluate(() => {
      return window.location.href.includes('roblox.com');
    });
    
    // If this is a Roblox page, use our dedicated Roblox FunCaptcha solver
    if (isRobloxPage) {
      logger.log("Detected Roblox page, using Roblox-specific FunCaptcha solver");
      return await solveRobloxSpecificFunCaptcha(page, config, logger);
    }
    
    // For non-Roblox pages, we would implement other CAPTCHA solving methods here
    logger.log("Non-Roblox page CAPTCHA solving not implemented");
    return false;
  } catch (error) {
    logger.error(`CAPTCHA solving error: ${error.message}`);
    return false;
  }
} 