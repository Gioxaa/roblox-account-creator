import puppeteer from 'puppeteer';
import fs from 'fs';
import readline from 'readline';
import fetch from 'node-fetch';
import path from 'path';
import cluster from 'cluster';
import os from 'os';

// Load and validate configuration
let config;
try {
  config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
} catch (error) {
  console.error('Error loading config file:', error.message);
  process.exit(1);
}

// Create logs directory if it doesn't exist
const LOGS_DIR = './logs';
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR);
}

// Create profiles directory if it doesn't exist
const PROFILES_DIR = './profiles';
if (!fs.existsSync(PROFILES_DIR)) {
  fs.mkdirSync(PROFILES_DIR);
}

// Initialize logger
const logger = {
  log: (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    fs.appendFileSync(path.join(LOGS_DIR, 'app.log'), logMessage + '\n');
  },
  error: (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ERROR: ${message}`;
    console.error(logMessage);
    fs.appendFileSync(path.join(LOGS_DIR, 'error.log'), logMessage + '\n');
  }
};

// Statistics tracking
const stats = {
  attempted: 0,
  successful: 0,
  failed: 0,
  startTime: Date.now()
};

// Utility functions
function generateReadableName(base) {
    const chars = "abcdefghijklmnopqrstuvwxyz";
    const randStr = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const randNum = Math.floor(Math.random() * 999);
    return `${base}${randStr}${randNum}`;
}

function generateRandomEmail() {
  const domains = ['gmail.com', 'outlook.com', 'yahoo.com', 'protonmail.com'];
  const randomDomain = domains[Math.floor(Math.random() * domains.length)];
  const username = generateReadableName('user');
  return `${username}@${randomDomain}`;
}

function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.71 Safari/537.36 Edg/94.0.992.38'
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Load proxies if available
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

// More advanced function to detect and extract Roblox FunCaptcha data
async function extractRobloxCaptchaData(page) {
  try {
    logger.log("Attempting to extract Roblox FunCaptcha data");
    
    // Method 1: Extract from performance entries to get URLs and parameters
    const performanceData = await page.evaluate(() => {
      const captchaEntries = window.performance.getEntries()
        .filter(entry => 
          entry.name && (
            entry.name.includes('arkoselabs') || 
            entry.name.includes('funcaptcha')
          )
        )
        .map(entry => entry.name);
      
      // Look for public key in URLs
      let publicKey = null;
      let sessionToken = null;
      let subdomain = null;
      let blob = '';
      
      for (const url of captchaEntries) {
        try {
          // Extract public key
          if (url.includes('public_key/')) {
            const keyMatch = url.match(/public_key\/([A-Z0-9\-]+)/);
            if (keyMatch && keyMatch[1]) {
              publicKey = keyMatch[1];
            }
          } else if (url.includes('pk=')) {
            const pkMatch = url.match(/pk=([A-Z0-9\-]+)/);
            if (pkMatch && pkMatch[1]) {
              publicKey = pkMatch[1];
            }
          }
          
          // Extract session token
          if (url.includes('session_token=')) {
            const tokenMatch = url.match(/session_token=([^&]+)/);
            if (tokenMatch && tokenMatch[1]) {
              sessionToken = tokenMatch[1];
            }
          }
          
          // Extract subdomain
          if (url.includes('arkoselabs') || url.includes('funcaptcha')) {
            try {
              const urlObj = new URL(url);
              subdomain = urlObj.hostname;
            } catch (e) {
              // URL parsing failed
            }
          }
          
          // Look for blob data
          if (url.includes('blob=')) {
            const blobMatch = url.match(/blob=([^&]+)/);
            if (blobMatch && blobMatch[1]) {
              blob = decodeURIComponent(blobMatch[1]);
            }
          }
        } catch (e) {
          console.error("Error parsing URL:", e);
        }
      }
      
      return { publicKey, sessionToken, subdomain, blob, urls: captchaEntries };
    });
    
    if (performanceData.publicKey) {
      logger.log(`Found public key from performance data: ${performanceData.publicKey}`);
      logger.log(`Found session token: ${performanceData.sessionToken || 'none'}`);
      logger.log(`Found subdomain: ${performanceData.subdomain || 'none'}`);
      
      const captchaData = {
        publicKey: performanceData.publicKey,
        surl: performanceData.subdomain ? `https://${performanceData.subdomain}` : config.funcaptchaOptions.surl,
        data: {
          blob: performanceData.blob || ''
        },
        sessionToken: performanceData.sessionToken
      };
      
      return captchaData;
    }
    
    // Method 2: Try to find the FunCaptcha iframe and extract its details
    const iframeData = await page.evaluate(() => {
      const iframes = Array.from(document.querySelectorAll('iframe'));
      for (const iframe of iframes) {
        if (iframe.src && (iframe.src.includes('arkoselabs') || iframe.src.includes('funcaptcha'))) {
          // Found a FunCaptcha iframe, extract data from its URL
          try {
            const url = new URL(iframe.src);
            
            // Extract all query parameters
            const params = {};
            url.searchParams.forEach((value, key) => {
              params[key] = value;
            });
            
            return {
              publicKey: params.pk || url.searchParams.get('pk'),
              surl: url.origin,
              data: {
                blob: params.blob || url.searchParams.get('blob') || '',
                siteData: params.siteData || url.searchParams.get('siteData') || ''
              },
              sessionToken: params.session || url.searchParams.get('session') || ''
            };
          } catch (e) {
            console.error("Error parsing iframe URL:", e);
            return {
              src: iframe.src,
              error: e.message
            };
          }
        }
      }
      return null;
    });
    
    if (iframeData && iframeData.publicKey) {
      logger.log(`Found CAPTCHA data from iframe: ${JSON.stringify(iframeData)}`);
      return iframeData;
    }
    
    // Method 3: Extract from global variables and script tags
    const scriptData = await page.evaluate(() => {
      try {
        // Check for Roblox specific globals
        if (window.Roblox && window.Roblox.FunCaptcha) {
          const fc = window.Roblox.FunCaptcha;
          return {
            publicKey: fc.publicKey || fc.PUBLIC_KEY,
            surl: fc.captchaUrl || fc.CAPTCHA_URL,
            data: {
              blob: fc.blob || (fc.data ? fc.data.blob : '')
            }
          };
        }
        
        // Check for ArkoseLabs global
        if (window.arkose) {
          return {
            publicKey: window.arkose.settings?.publicKey,
            surl: window.arkose.settings?.apiUrl,
            data: {
              blob: window.arkose.settings?.blob || ''
            }
          };
        }
        
        // Look through script tags
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
          const content = script.textContent || '';
          
          if (content.includes('arkose') || content.includes('funcaptcha') || content.includes('captcha')) {
            // Try to extract public key
            const keyMatch = content.match(/['"]public[-_]?key['"]:\s*['"]([A-Z0-9\-]+)['"]/i);
            if (keyMatch && keyMatch[1]) {
              return {
                publicKey: keyMatch[1],
                surl: 'https://arkoselabs.roblox.com'
              };
            }
          }
        }
        
        return null;
      } catch (e) {
        console.error("Error extracting script data:", e);
        return null;
      }
    });
    
    if (scriptData && scriptData.publicKey) {
      logger.log(`Found CAPTCHA data from scripts: ${JSON.stringify(scriptData)}`);
      return scriptData;
    }
    
    // Method 4: Use default values from config
    logger.log("Using default CAPTCHA configuration");
    return {
      publicKey: config.siteKey,
      surl: config.funcaptchaOptions.surl,
      data: {
        blob: config.funcaptchaOptions.data.blob
      }
    };
  } catch (e) {
    logger.error(`Error extracting Roblox CAPTCHA data: ${e.message}`);
    return {
      publicKey: config.siteKey,
      surl: config.funcaptchaOptions.surl || 'https://arkoselabs.roblox.com'
    };
  }
}

// Function to extract CAPTCHA details from network resources
async function extractCaptchaDetailsFromNetwork(page) {
  try {
    // Extract from performance entries to get URLs and parameters
    const networkDetails = await page.evaluate(() => {
      // Find CAPTCHA-related resources
      const resources = window.performance.getEntries()
        .filter(entry => 
          entry.name && (
            entry.name.includes('arkoselabs') || 
            entry.name.includes('funcaptcha')
          )
        )
        .map(entry => entry.name);
      
      // Look for specific URLs with key parameters
      let publicKey = null;
      let sessionToken = null;
      let surl = null;
      
      // Extract public key from URLs - first try public_key path
      for (const url of resources) {
        const publicKeyMatch = url.match(/public_key\/([A-Z0-9\-]+)/i);
        if (publicKeyMatch && publicKeyMatch[1]) {
          publicKey = publicKeyMatch[1];
          break;
        }
      }
      
      // If not found, try pk param
      if (!publicKey) {
        for (const url of resources) {
          const pkMatch = url.match(/pk=([A-Z0-9\-]+)/i);
          if (pkMatch && pkMatch[1]) {
            publicKey = pkMatch[1];
            break;
          }
        }
      }
      
      // Extract session token
      for (const url of resources) {
        const sessionMatch = url.match(/session(?:_token)?=([a-z0-9\.]+)/i);
        if (sessionMatch && sessionMatch[1]) {
          sessionToken = sessionMatch[1];
          break;
        }
      }
      
      // Extract domain
      if (resources.length > 0) {
        try {
          const url = new URL(resources[0]);
          surl = url.origin;
        } catch (e) {
          console.error("Error parsing URL:", e);
        }
      }
      
      return { 
        publicKey, 
        sessionToken, 
        surl,
        resources
      };
    });
    
    return networkDetails;
  } catch (e) {
    logger.error(`Error extracting CAPTCHA details from network: ${e.message}`);
    return null;
  }
}

// Direct 2captcha API call for FunCaptcha
async function solveFunCaptchaDirectly(siteUrl, siteKey, subdomain, userAgent, apiKey) {
  try {
    logger.log("Using direct 2captcha API for FunCaptcha");
    
    // Step 1: Send the CAPTCHA to 2captcha
    const in2captchaUrl = "https://2captcha.com/in.php";
    
    const formData = new URLSearchParams();
    formData.append('key', apiKey);
    formData.append('method', 'funcaptcha');
    formData.append('publickey', siteKey);
    formData.append('surl', 'https://roblox-api.arkoselabs.com');
    formData.append('pageurl', siteUrl);
    formData.append('json', '1');
    formData.append('userAgent', userAgent);
    
    logger.log(`Sending FunCaptcha request to 2captcha: ${formData.toString()}`);
    
    const submitResponse = await fetch(in2captchaUrl, {
      method: 'POST',
      body: formData
    });
    
    const submitResult = await submitResponse.json();
    logger.log(`2captcha submission response: ${JSON.stringify(submitResult)}`);
    
    if (submitResult.status !== 1) {
      throw new Error(`2captcha error: ${submitResult.request}`);
    }
    
    const captchaId = submitResult.request;
    logger.log(`CAPTCHA submitted successfully, got ID: ${captchaId}`);
    
    // Step 2: Wait and then get the result
    // Wait initial recommended time before first check
    logger.log("Waiting 20 seconds before checking for results...");
    await delay(20000);
    
    const maxAttempts = config.captchaMaxAttempts || 30;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      logger.log(`Checking CAPTCHA solution status (attempt ${attempt}/${maxAttempts})...`);
      
      const res2captchaUrl = `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${captchaId}&json=1`;
      
      const resultResponse = await fetch(res2captchaUrl);
      const resultData = await resultResponse.json();
      
      logger.log(`2captcha result response: ${JSON.stringify(resultData)}`);
      
      if (resultData.status === 1) {
        // Success - we have the token
        const token = resultData.request;
        logger.log(`CAPTCHA solved successfully! Token: ${token.substring(0, 20)}...`);
        return token;
      } else if (resultData.request === "CAPCHA_NOT_READY") {
        // CAPTCHA is still being solved
        logger.log("CAPTCHA still being solved, waiting...");
        await delay(5000); // Wait 5 seconds before checking again
        continue;
      } else {
        // Error
        throw new Error(`2captcha error: ${resultData.request}`);
      }
    }
    
    throw new Error("Failed to get CAPTCHA solution after maximum attempts");
  } catch (error) {
    logger.error(`Direct 2captcha API error: ${error.message}`);
    throw error;
  }
}

// Direct solution for Roblox's FunCaptcha using 2captcha
async function solveRobloxFunCaptcha(apiKey, siteKey) {
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
    formData.append('data[blob]', '');
    formData.append('userAgent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36');
    
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
    
    const maxAttempts = 10;
    
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
        await delay(5000);
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
        await delay(5000); // Wait 5 seconds before checking again
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

// CAPTCHA solving function with multiple service support
async function solveCaptcha(page, siteUrl, siteKey) {
  if (!config.captchaSolve) {
    logger.log("Automatic CAPTCHA solving is disabled");
    return false;
  }

  try {
    logger.log(`Attempting to solve CAPTCHA automatically with ${config.captchaService} API`);
    
    // First check if we can extract the key from network resources
    const networkDetails = await extractCaptchaDetailsFromNetwork(page);
    
    if (networkDetails && networkDetails.publicKey) {
      logger.log(`Found public key from network resources: ${networkDetails.publicKey}`);
      siteKey = networkDetails.publicKey;
    }
    
    if (networkDetails && networkDetails.surl) {
      logger.log(`Found CAPTCHA service URL: ${networkDetails.surl}`);
      config.funcaptchaOptions.surl = networkDetails.surl;
      
      // Extract subdomain
      try {
        const urlObj = new URL(networkDetails.surl);
        config.funcaptchaOptions.subdomain = urlObj.hostname;
        logger.log(`Updated subdomain to: ${config.funcaptchaOptions.subdomain}`);
      } catch (e) {
        logger.error(`Error parsing URL for subdomain: ${e.message}`);
      }
    }
    
    // Extract Roblox-specific CAPTCHA data
    const captchaData = await extractRobloxCaptchaData(page);
    
    if (!captchaData || !captchaData.publicKey) {
      logger.log("Could not extract required CAPTCHA data from page DOM");
      // Fall back to network details and config
      if (!siteKey) {
        logger.log(`Using default site key: ${config.siteKey}`);
        siteKey = config.siteKey;
      }
    } else {
      // Use the extracted key
      siteKey = captchaData.publicKey;
      logger.log(`Found CAPTCHA key from page DOM: ${siteKey}`);
    }
    
    // Get the subdomain from available sources
    const subdomain = config.funcaptchaOptions.subdomain;
    logger.log(`Using CAPTCHA subdomain: ${subdomain}`);
    
    // Get user agent from the page
    const userAgent = await page.evaluate(() => navigator.userAgent);
    logger.log(`Using User-Agent: ${userAgent}`);
    
    // Prepare data object as JSON string if blob exists
    let dataString = null;
    if (captchaData && captchaData.data && captchaData.data.blob) {
      dataString = JSON.stringify({ "blob": captchaData.data.blob });
      logger.log(`Using CAPTCHA data blob from page DOM: ${dataString}`);
    }
    
    // Determine CAPTCHA type (FunCaptcha, hCaptcha, etc.)
    let captchaType = "FunCaptcha"; // Default
    
    // Check for hCaptcha
    const isHCaptcha = await page.evaluate(() => {
      return (
        document.querySelector('iframe[src*="hcaptcha.com"]') !== null ||
        document.querySelector('div[class*="h-captcha"]') !== null ||
        document.querySelector('[data-hcaptcha-widget-id]') !== null
      );
    });
    
    if (isHCaptcha) {
      captchaType = "hCaptcha";
      logger.log("Detected hCaptcha instead of FunCaptcha");
    }
    
    // Try multiple CAPTCHA solving services in sequence
    const services = [];
    
    // Add primary service first
    if (config.captchaService && 
        config.captchaServices && 
        config.captchaServices[config.captchaService] && 
        config.captchaServices[config.captchaService].enabled) {
      services.push(config.captchaService);
    }
    
    // Add all other enabled services
    if (config.captchaServices) {
      for (const [service, settings] of Object.entries(config.captchaServices)) {
        if (settings.enabled && !services.includes(service)) {
          services.push(service);
        }
      }
    }
    
    // If no services were added, try the default with the main API key
    if (services.length === 0) {
      services.push('2captcha');
    }
    
    // Try each service until one succeeds
    for (const service of services) {
      try {
        logger.log(`Trying CAPTCHA service: ${service}`);
        
        // Get the API key for this service
        let apiKey = config.captchaApiKey; // Default fallback
        
        if (config.captchaServices && 
            config.captchaServices[service] && 
            config.captchaServices[service].apiKey) {
          apiKey = config.captchaServices[service].apiKey;
        }
        
        if (!apiKey) {
          logger.error(`No API key found for service: ${service}`);
          continue;
        }
        
        let token = null;
        
        if (captchaType === "FunCaptcha") {
          if (service === '2captcha') {
            // Try the direct Roblox-specific method first
            try {
              token = await solveRobloxFunCaptcha(apiKey, siteKey);
            } catch (directError) {
              logger.error(`Direct Roblox FunCaptcha method failed: ${directError.message}`);
              logger.log("Falling back to direct 2captcha method");
              try {
                token = await solveFunCaptchaDirectly(siteUrl, siteKey, subdomain, userAgent, apiKey);
              } catch (directApiError) {
                logger.error(`Direct 2captcha method failed: ${directApiError.message}`);
                logger.log("Falling back to standard 2captcha method");
                token = await solve2Captcha(siteUrl, siteKey, subdomain, userAgent, dataString, apiKey);
              }
            }
          } else if (service === 'anticaptcha') {
            token = await solveAntiCaptcha(siteUrl, siteKey, subdomain, userAgent, dataString, apiKey);
          } else if (service === 'capmonster') {
            token = await solveCapMonster(siteUrl, siteKey, subdomain, userAgent, dataString, apiKey);
          }
        } else if (captchaType === "hCaptcha") {
          if (service === '2captcha') {
            token = await solve2CaptchaHCaptcha(siteUrl, siteKey, userAgent, apiKey);
          } else if (service === 'anticaptcha') {
            token = await solveAntiCaptchaHCaptcha(siteUrl, siteKey, userAgent, apiKey);
          } else if (service === 'capmonster') {
            token = await solveCapMonsterHCaptcha(siteUrl, siteKey, userAgent, apiKey);
          }
        }
        
        if (token) {
          // Apply the solution to the page
          let injected = false;
          
          if (captchaType === "FunCaptcha") {
            injected = await injectFunCaptchaToken(page, token);
          } else if (captchaType === "hCaptcha") {
            injected = await injectHCaptchaToken(page, token);
          }
          
          return injected;
        }
      } catch (serviceError) {
        logger.error(`${service} solving failed: ${serviceError.message}`);
        // Continue to next service
      }
    }
    
    // If we get here, all services failed
    logger.error("All CAPTCHA solving services failed");
    return false;
  } catch (error) {
    logger.error(`CAPTCHA solving error: ${error.message}`);
    return false;
  }
}

// 2Captcha solving implementation
async function solve2Captcha(siteUrl, siteKey, subdomain, userAgent, dataString, apiKey) {
  try {
    logger.log("Starting 2captcha FunCaptcha solving process");
    
    // Use the correct 2captcha API format for FunCaptcha
    const apiUrl = "https://2captcha.com/in.php";
    
    // Prepare the parameters according to 2captcha documentation
    const params = new URLSearchParams();
    params.append('key', apiKey);
    params.append('method', 'funcaptcha');
    params.append('publickey', siteKey);
    params.append('surl', 'https://roblox-api.arkoselabs.com');
    params.append('pageurl', siteUrl);
    params.append('userAgent', userAgent);
    params.append('json', '1');
    
    // Add data if available
    if (dataString) {
      try {
        const dataObj = JSON.parse(dataString);
        if (dataObj.blob) {
          params.append('data[blob]', dataObj.blob);
        }
      } catch (e) {
        logger.error(`Error parsing data string: ${e.message}`);
      }
    }
    
    logger.log(`2captcha request params: ${params.toString()}`);
    
    // Create the task
    logger.log("Sending request to 2captcha...");
    const createResponse = await fetch(apiUrl, {
      method: "POST",
      body: params
    });
    
    if (!createResponse.ok) {
      throw new Error(`2captcha API returned error status: ${createResponse.status}`);
    }
    
    const responseText = await createResponse.text();
    logger.log(`2captcha raw response: ${responseText}`);
    
    // Parse the response
    let createResult;
    try {
      createResult = JSON.parse(responseText);
    } catch (e) {
      // If it's not JSON, check if it starts with OK|
      if (responseText.startsWith('OK|')) {
        createResult = {
          status: 1,
          request: responseText.substring(3)
        };
      } else {
        throw new Error(`2captcha API error: ${responseText}`);
      }
    }
    
    if (createResult.status !== 1) {
      throw new Error(`2captcha API error: ${createResult.request || responseText}`);
    }
    
    // Extract the captcha ID
    const captchaId = createResult.request;
    logger.log(`2captcha task created successfully with ID: ${captchaId}`);
    
    // Now poll for the result
    logger.log("Waiting for 2captcha to solve the CAPTCHA...");
    
    // Wait initial recommended time before first check
    logger.log("Waiting 20 seconds before checking for results...");
    await delay(20000);
    
    // Use a more robust polling approach
    const maxAttempts = config.captchaMaxAttempts || 40;
    const initialDelay = config.captchaRetryDelay || 5000; // Initial delay of 5 seconds as recommended
    const maxDelay = 10000;
    let currentDelay = initialDelay;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      logger.log(`Checking CAPTCHA solution status (attempt ${attempt}/${maxAttempts})...`);
      await delay(currentDelay);
      
      // Increase delay slightly each time, but cap it
      currentDelay = Math.min(currentDelay * 1.2, maxDelay);
      
      try {
        const getResultUrl = `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${captchaId}&json=1`;
        const getResponse = await fetch(getResultUrl);
        
        if (!getResponse.ok) {
          logger.error(`2captcha result API returned error status: ${getResponse.status}`);
          continue;
        }
        
        const getResult = await getResponse.json();
        logger.log(`2captcha result response: ${JSON.stringify(getResult)}`);
        
        if (getResult.status === 0) {
          // Error occurred
          if (getResult.request === "CAPCHA_NOT_READY") {
            logger.log("CAPTCHA still being solved, waiting...");
            continue;
          } else {
            throw new Error(`2captcha API error: ${getResult.request}`);
          }
        }
        
        if (getResult.status === 1) {
          // Success - we have the token
          const token = getResult.request;
          if (!token) {
            throw new Error("2captcha returned success but no token");
          }
          
          logger.log(`CAPTCHA solved successfully! Token: ${token.substring(0, 20)}...`);
          return token;
        }
      } catch (pollError) {
        logger.error(`Error polling for 2captcha result: ${pollError.message}`);
        // Continue trying
      }
    }
    
    throw new Error("Failed to get CAPTCHA solution after maximum attempts");
  } catch (error) {
    logger.error(`2captcha solving error: ${error.message}`);
    throw error;
  }
}

// 2Captcha solving implementation for hCaptcha
async function solve2CaptchaHCaptcha(siteUrl, siteKey, userAgent, apiKey) {
  // Use 2captcha API format for hCaptcha
  const params = {
    clientKey: apiKey,
    task: {
      type: "HCaptchaTaskProxyless",
      websiteURL: siteUrl,
      websiteKey: siteKey,
      userAgent: userAgent
    }
  };
  
  logger.log(`2captcha hCaptcha request params: ${JSON.stringify(params)}`);
  
  // First create a task
  logger.log("Creating 2captcha hCaptcha task...");
  const createTaskUrl = "https://api.2captcha.com/createTask";
  const createResponse = await fetch(createTaskUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(params)
  });
  
  if (!createResponse.ok) {
    throw new Error(`2captcha API returned error status: ${createResponse.status}`);
  }
  
  const createResult = await createResponse.json();
  
  logger.log(`2captcha createTask response: ${JSON.stringify(createResult)}`);
  
  if (createResult.errorId !== 0) {
    throw new Error(`2captcha API error: ${createResult.errorDescription || "Unknown error"}`);
  }
  
  const taskId = createResult.taskId;
  logger.log(`2captcha task created successfully with ID: ${taskId}`);
  
  // Now poll for the result
  logger.log("Waiting for 2captcha to solve the hCaptcha...");
  
  // Use a more robust polling approach
  const maxAttempts = config.captchaMaxAttempts || 40;
  const initialDelay = config.captchaRetryDelay || 2000;
  const maxDelay = 5000;
  let currentDelay = initialDelay;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.log(`Checking hCaptcha solution status (attempt ${attempt}/${maxAttempts})...`);
    await delay(currentDelay);
    
    // Increase delay slightly each time, but cap it
    currentDelay = Math.min(currentDelay * 1.2, maxDelay);
    
    try {
      const getResultUrl = "https://api.2captcha.com/getTaskResult";
      const getResponse = await fetch(getResultUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          clientKey: apiKey,
          taskId: taskId
        })
      });
      
      if (!getResponse.ok) {
        logger.error(`2captcha result API returned error status: ${getResponse.status}`);
        continue;
      }
      
      const getResult = await getResponse.json();
      
      logger.log(`2captcha result response: ${JSON.stringify(getResult)}`);
      
      if (getResult.errorId !== 0) {
        logger.error(`2captcha API error: ${getResult.errorDescription || "Unknown error"}`);
        continue;
      }
      
      if (getResult.status === "processing") {
        logger.log("hCaptcha still being solved, waiting...");
        continue;
      }
      
      if (getResult.status === "ready") {
        const token = getResult.solution?.gRecaptchaResponse || getResult.solution?.token;
        if (!token) {
          throw new Error("2captcha returned ready status but no token");
        }
        
        logger.log(`hCaptcha solved successfully! Token: ${token.substring(0, 20)}...`);
        return token;
      }
    } catch (pollError) {
      logger.error(`Error polling for 2captcha result: ${pollError.message}`);
      // Continue trying
    }
  }
  
  throw new Error("Failed to get hCaptcha solution after maximum attempts");
}

// Function to inject hCaptcha token into the page
async function injectHCaptchaToken(page, token) {
  try {
    logger.log("Injecting hCaptcha token into page");
    logger.log(`Token value: ${token.substring(0, 20)}...`);
    
    // Inject the token into the page
    const injected = await page.evaluate((token) => {
      try {
        // Method 1: Set token via hcaptcha object
        if (window.hcaptcha) {
          console.log("Found hcaptcha object, attempting to set token");
          
          // Try to find the widget ID
          let widgetID = '';
          if (typeof window.hcaptcha.getResponse === 'function') {
            // Get all widget IDs
            const widgetIDs = window.hcaptcha.getRenderParameters ? 
                              Object.keys(window.hcaptcha.getRenderParameters()) : 
                              [''];
            
            if (widgetIDs.length > 0) {
              widgetID = widgetIDs[0];
            }
          }
          
          // Set the response
          if (typeof window.hcaptcha.setResponse === 'function') {
            window.hcaptcha.setResponse(widgetID, token);
            console.log("Set token via hcaptcha.setResponse");
            return "hcaptcha.setResponse";
          }
        }
        
        // Method 2: Find hCaptcha input field and set its value
        const inputs = document.querySelectorAll('textarea[name="h-captcha-response"], input[name="h-captcha-response"]');
        if (inputs.length > 0) {
          for (const input of inputs) {
            input.value = token;
          }
          console.log("Set token in h-captcha-response field");
          
          // Try to submit the form
          const form = document.querySelector('form');
          if (form) {
            // Create and dispatch an event
            const event = new Event('captchaVerified', { bubbles: true });
            form.dispatchEvent(event);
            
            // Try to find and click the submit button
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) {
              submitButton.disabled = false;
              submitButton.click();
              console.log("Clicked submit button");
            }
          }
          
          return "Set token in input field";
        }
        
        // Method 3: Dispatch a custom event that the page might be listening for
        const captchaVerifiedEvent = new CustomEvent('hcaptchaVerified', { 
          detail: { token },
          bubbles: true
        });
        document.dispatchEvent(captchaVerifiedEvent);
        console.log("Dispatched hcaptchaVerified event");
        
        return "Tried multiple injection methods";
      } catch (e) {
        console.error("Error injecting hCaptcha token:", e);
        return "Error: " + e.message;
      }
    }, token);
    
    logger.log(`hCaptcha token injection result: ${injected}`);
    
    // Wait a moment for the token to be processed
    await delay(2000);
    
    // Try to submit the form or click relevant buttons
    await page.evaluate(() => {
      try {
        // Try to find and click submit buttons
        const submitButtons = document.querySelectorAll('button[type="submit"], input[type="submit"], button.submit-button');
        for (const button of submitButtons) {
          if (!button.disabled) {
            console.log("Clicking submit button after hCaptcha token injection");
            button.click();
            return "Clicked submit button";
          }
        }
        
        return "No submit button found or all are disabled";
      } catch (e) {
        console.error("Error during post-injection actions:", e);
        return "Error: " + e.message;
      }
    }).then(result => logger.log(`Post-injection action: ${result}`))
      .catch(e => logger.error(`Post-injection error: ${e.message}`));
    
    return true;
  } catch (error) {
    logger.error(`Error injecting hCaptcha token: ${error.message}`);
    return false;
  }
}

// Anti-Captcha solving implementation
async function solveAntiCaptcha(siteUrl, siteKey, subdomain, userAgent, dataString, apiKey) {
  // Use Anti-Captcha API format
  const params = {
    clientKey: apiKey,
    task: {
      type: "FunCaptchaTaskProxyless",
      websiteURL: siteUrl,
      websitePublicKey: siteKey,
      funcaptchaApiJSSubdomain: subdomain,
      userAgent: userAgent
    }
  };
  
  if (dataString) {
    params.task.data = dataString;
  }
  
  logger.log(`Anti-Captcha request params: ${JSON.stringify(params)}`);
  
  // Create task
  logger.log("Creating Anti-Captcha task...");
  const createTaskUrl = "https://api.anti-captcha.com/createTask";
  const createResponse = await fetch(createTaskUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(params)
  });
  
  if (!createResponse.ok) {
    throw new Error(`Anti-Captcha API returned error status: ${createResponse.status}`);
  }
  
  const createResult = await createResponse.json();
  
  if (createResult.errorId !== 0) {
    throw new Error(`Anti-Captcha API error: ${createResult.errorDescription || "Unknown error"}`);
  }
  
  const taskId = createResult.taskId;
  logger.log(`Anti-Captcha task created successfully with ID: ${taskId}`);
  
  // Poll for result
  const maxAttempts = 40;
  const pollDelay = 3000;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.log(`Checking Anti-Captcha solution status (attempt ${attempt}/${maxAttempts})...`);
    await delay(pollDelay);
    
    const getResultUrl = "https://api.anti-captcha.com/getTaskResult";
    const getResponse = await fetch(getResultUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        clientKey: apiKey,
        taskId: taskId
      })
    });
    
    if (!getResponse.ok) {
      logger.error(`Anti-Captcha result API returned error status: ${getResponse.status}`);
      continue;
    }
    
    const getResult = await getResponse.json();
    
    if (getResult.errorId !== 0) {
      logger.error(`Anti-Captcha API error: ${getResult.errorDescription || "Unknown error"}`);
      continue;
    }
    
    if (getResult.status === "processing") {
      logger.log("CAPTCHA still being solved, waiting...");
      continue;
    }
    
    if (getResult.status === "ready") {
      const token = getResult.solution?.token;
      if (!token) {
        throw new Error("Anti-Captcha returned ready status but no token");
      }
      
      logger.log(`CAPTCHA solved successfully with Anti-Captcha! Token: ${token.substring(0, 20)}...`);
      return token;
    }
  }
  
  throw new Error("Failed to get Anti-Captcha solution after maximum attempts");
}

// CapMonster solving implementation
async function solveCapMonster(siteUrl, siteKey, subdomain, userAgent, dataString, apiKey) {
  // Use CapMonster API format
  const params = {
    clientKey: apiKey,
    task: {
      type: "FunCaptchaTaskProxyless",
      websiteURL: siteUrl,
      websitePublicKey: siteKey,
      funcaptchaApiJSSubdomain: subdomain,
      userAgent: userAgent
    }
  };
  
  if (dataString) {
    params.task.data = dataString;
  }
  
  logger.log(`CapMonster request params: ${JSON.stringify(params)}`);
  
  // Create task
  logger.log("Creating CapMonster task...");
  const createTaskUrl = "https://api.capmonster.cloud/createTask";
  const createResponse = await fetch(createTaskUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(params)
  });
  
  if (!createResponse.ok) {
    throw new Error(`CapMonster API returned error status: ${createResponse.status}`);
  }
  
  const createResult = await createResponse.json();
  
  if (createResult.errorId !== 0) {
    throw new Error(`CapMonster API error: ${createResult.errorDescription || "Unknown error"}`);
  }
  
  const taskId = createResult.taskId;
  logger.log(`CapMonster task created successfully with ID: ${taskId}`);
  
  // Poll for result
  const maxAttempts = 40;
  const pollDelay = 3000;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.log(`Checking CapMonster solution status (attempt ${attempt}/${maxAttempts})...`);
    await delay(pollDelay);
    
    const getResultUrl = "https://api.capmonster.cloud/getTaskResult";
    const getResponse = await fetch(getResultUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        clientKey: apiKey,
        taskId: taskId
      })
    });
    
    if (!getResponse.ok) {
      logger.error(`CapMonster result API returned error status: ${getResponse.status}`);
      continue;
    }
    
    const getResult = await getResponse.json();
    
    if (getResult.errorId !== 0) {
      logger.error(`CapMonster API error: ${getResult.errorDescription || "Unknown error"}`);
      continue;
    }
    
    if (getResult.status === "processing") {
      logger.log("CAPTCHA still being solved, waiting...");
      continue;
    }
    
    if (getResult.status === "ready") {
      const token = getResult.solution?.token;
      if (!token) {
        throw new Error("CapMonster returned ready status but no token");
      }
      
      logger.log(`CAPTCHA solved successfully with CapMonster! Token: ${token.substring(0, 20)}...`);
      return token;
    }
  }
  
  throw new Error("Failed to get CapMonster solution after maximum attempts");
}

// Function to inject the FunCaptcha token into the page
async function injectFunCaptchaToken(page, token) {
  try {
    logger.log("Injecting FunCaptcha token into page");
    logger.log(`Token value: ${token.substring(0, 20)}...`);
    
    // First try the Roblox-specific ArkoseLabs token injection
    const arkoseResult = await page.evaluate((token) => {
      try {
        // Method 1: Direct token injection to ArkoseLabs
        if (window.arkose && window.arkose.setTokenResponse) {
          console.log("Found arkose object, setting token directly");
          window.arkose.setTokenResponse(token);
          return "Set token via arkose.setTokenResponse";
        }
        
        // Method 2: Find the funcaptcha iframe and send message
        const funcaptchaIframe = document.querySelector('iframe[src*="arkoselabs"], iframe[src*="funcaptcha"]');
        if (funcaptchaIframe) {
          console.log("Found FunCaptcha iframe, sending postMessage");
          try {
            // Send the token via postMessage to the iframe
            funcaptchaIframe.contentWindow.postMessage(
              JSON.stringify({
                message: "token", 
                token: token
              }), 
              "*"
            );
            return "Sent token via postMessage to FunCaptcha iframe";
          } catch (e) {
            console.error("Error sending message to iframe:", e);
          }
        }
        
        // Method 3: Find any token field in the page
        const tokenFields = document.querySelectorAll('input[name="fc-token"], input[name="arkose-token"], input[name="funcaptcha-token"], input[name="captcha-token"], input[name="verification-token"]');
        if (tokenFields.length > 0) {
          for (const field of tokenFields) {
            field.value = token;
          }
          return `Set token in ${tokenFields.length} input fields`;
        }
        
        // Method 4: Create a hidden input field with the token
        const form = document.querySelector('form');
        if (form) {
          console.log("Found form, creating hidden input for token");
          const hiddenInput = document.createElement('input');
          hiddenInput.type = 'hidden';
          hiddenInput.name = 'fc-token';
          hiddenInput.value = token;
          form.appendChild(hiddenInput);
          return "Created hidden input with token in form";
        }
        
        return null;
      } catch (e) {
        console.error("Error in ArkoseLabs token injection:", e);
        return "Error: " + e.message;
      }
    }, token);
    
    if (arkoseResult) {
      logger.log(`ArkoseLabs token injection: ${arkoseResult}`);
    }
    
    // Wait a moment for the token to be processed
    await delay(2000);
    
    // Try Roblox-specific methods
    const robloxResult = await page.evaluate((token) => {
      try {
        // Method 1: Set token via Roblox.FunCaptcha
        if (window.Roblox && window.Roblox.FunCaptcha) {
          console.log("Found Roblox.FunCaptcha, attempting to set token");
          
          // Method 1a: Using setToken function
          if (typeof window.Roblox.FunCaptcha.setToken === 'function') {
            window.Roblox.FunCaptcha.setToken(token);
            console.log("Set token via Roblox.FunCaptcha.setToken");
            return "Roblox.FunCaptcha.setToken";
          }
          
          // Method 1b: Using setResponse function
          if (typeof window.Roblox.FunCaptcha.setResponse === 'function') {
            window.Roblox.FunCaptcha.setResponse(token);
            console.log("Set token via Roblox.FunCaptcha.setResponse");
            return "Roblox.FunCaptcha.setResponse";
          }
          
          // Method 1c: Store directly in object
          window.Roblox.FunCaptcha.token = token;
          window.Roblox.FunCaptcha.TOKEN = token;
          window.Roblox.FunCaptcha._token = token;
          console.log("Stored token in Roblox.FunCaptcha properties");
          return "Stored token in Roblox.FunCaptcha properties";
        }
        
        return null;
      } catch (e) {
        console.error("Error in Roblox-specific token injection:", e);
        return null;
      }
    }, token);
    
    if (robloxResult) {
      logger.log(`Roblox-specific token injection: ${robloxResult}`);
    }
    
    // Try to submit the form or click relevant buttons
    const submitResult = await page.evaluate(() => {
      try {
        // Method 1: Find and click submit buttons
        const submitButtons = document.querySelectorAll('button[type="submit"], input[type="submit"], button.signup-button, #signup-button');
        for (const button of submitButtons) {
          if (!button.disabled) {
            console.log("Clicking submit button after token injection");
            button.click();
            return "Clicked submit button";
          }
        }
        
        // Method 2: Submit the form directly
        const forms = document.querySelectorAll('form');
        for (const form of forms) {
          console.log("Submitting form directly");
          form.submit();
          return "Submitted form directly";
        }
        
        // Method 3: Try to find any button that looks like it would submit the form
        const allButtons = document.querySelectorAll('button');
        for (const button of allButtons) {
          const text = button.textContent.toLowerCase();
          if (text.includes('sign up') || text.includes('submit') || text.includes('continue') || text.includes('next')) {
            console.log(`Clicking button with text: ${button.textContent}`);
            button.click();
            return `Clicked button with text: ${button.textContent}`;
          }
        }
        
        return "No submit button or form found";
      } catch (e) {
        console.error("Error during form submission:", e);
        return "Error: " + e.message;
      }
    });
    
    logger.log(`Form submission result: ${submitResult}`);
    
    // Wait to ensure the token is processed
    await delay(3000);
    
    // Verify if the token was accepted
    const verificationResult = await page.evaluate(() => {
      // Check if we're redirected or if there's a success message
      if (window.location.href.includes('/home') || !window.location.href.includes('signup')) {
        return "Success: Redirected after token submission";
      }
      
      // Check if CAPTCHA elements are still visible
      const captchaElements = document.querySelectorAll(
        'iframe[src*="arkoselabs"], iframe[src*="funcaptcha"], [class*="captcha"], [id*="captcha"]'
      );
      
      if (captchaElements.length === 0) {
        return "Success: CAPTCHA elements no longer visible";
      }
      
      // Check for success messages
      const successElements = document.querySelectorAll(
        '.signup-success, .success-message, [class*="success"]'
      );
      
      if (successElements.length > 0) {
        return "Success: Found success message elements";
      }
      
      return "Verification inconclusive";
    });
    
    logger.log(`Token verification result: ${verificationResult}`);
    
    // Take screenshot after token injection
    if (config.verboseLog) {
      try {
        const screenshotPath = path.join(LOGS_DIR, `post_token_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath });
        logger.log(`Saved post-token screenshot to ${screenshotPath}`);
      } catch (e) {
        logger.error(`Failed to save post-token screenshot: ${e.message}`);
      }
    }
    
    return verificationResult.includes("Success");
  } catch (error) {
    logger.error(`Error injecting token: ${error.message}`);
    return false;
  }
}

// Manual CAPTCHA handling
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const waitForEnter = () => {
    return new Promise(resolve => {
        rl.question('CAPTCHA completed? Press ENTER to continue...\n', () => {
            resolve();
        });
    });
};

// Function to get a random proxy
function getRandomProxy() {
  if (proxies.length === 0 || !config.useProxies) {
    return null;
  }
  return proxies[Math.floor(Math.random() * proxies.length)];
}

// Function to monitor and debug CAPTCHA status
async function monitorCaptchaStatus(page, timeout = 30000) {
  try {
    logger.log("Starting CAPTCHA monitoring");
    
    // Setup a monitor that watches for CAPTCHA-related changes
    const captchaMonitor = await page.evaluate(() => {
      window.__captchaDebug = {
        events: [],
        errors: [],
        status: 'monitoring'
      };
      
      // Monitor events related to CAPTCHA
      const captchaEvents = [
        'load', 'message', 'error', 
        'captchaCompleted', 'captchaFailed', 
        'arkoseLabsCompleted', 'arkoseLabsLoaded'
      ];
      
      captchaEvents.forEach(eventType => {
        window.addEventListener(eventType, (e) => {
          const info = {
            type: eventType,
            time: new Date().toISOString(),
            source: e.source ? (e.source === window ? 'window' : 'external') : 'dom',
            data: eventType === 'message' ? JSON.stringify(e.data).substring(0, 100) : null
          };
          
          window.__captchaDebug.events.push(info);
          
          if (eventType === 'error') {
            window.__captchaDebug.errors.push(e.message || 'Unknown error');
          }
          
          if (eventType === 'captchaCompleted' || eventType === 'arkoseLabsCompleted') {
            window.__captchaDebug.status = 'completed';
          } else if (eventType === 'captchaFailed') {
            window.__captchaDebug.status = 'failed';
          }
        });
      });
      
      // Try to detect iframe changes
      setInterval(() => {
        const captchaIframe = document.querySelector('iframe[src*="arkoselabs"], iframe[src*="funcaptcha"]');
        if (captchaIframe) {
          if (!window.__captchaDebug.iframe) {
            window.__captchaDebug.iframe = {
              src: captchaIframe.src,
              found: new Date().toISOString()
            };
          }
        }
      }, 1000);
      
      return "Monitoring setup complete";
    });
    
    logger.log(`CAPTCHA monitoring: ${captchaMonitor}`);
    
    // Wait for the specified timeout
    await delay(timeout);
    
    // Collect debug information
    const captchaDebugInfo = await page.evaluate(() => {
      return window.__captchaDebug || { status: 'unknown', events: [], errors: [] };
    });
    
    logger.log(`CAPTCHA status: ${captchaDebugInfo.status}`);
    if (captchaDebugInfo.iframe) {
      logger.log(`CAPTCHA iframe found: ${captchaDebugInfo.iframe.src}`);
    }
    
    if (captchaDebugInfo.errors && captchaDebugInfo.errors.length > 0) {
      logger.log(`CAPTCHA errors: ${captchaDebugInfo.errors.join(', ')}`);
    }
    
    return captchaDebugInfo;
  } catch (e) {
    logger.error(`Error monitoring CAPTCHA: ${e.message}`);
    return { status: 'error', error: e.message };
  }
}

// Modified captcha handling function with improved debugging for Roblox
async function handleCaptcha(page, username, workerID) {
  try {
    // Check for CAPTCHA
    logger.log(`Worker ${workerID}: Checking for CAPTCHA for ${username}`);
    
    // First, let's get information about any CAPTCHA resources detected in the page
    const captchaDetails = {
      resources: [],
      iframeSrc: null,
      publicKey: null,
      sessionToken: null
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
            iframe.src.includes('funcaptcha')
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
          const screenshotPath = path.join(LOGS_DIR, `before_captcha_${username}_${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: true });
          logger.log(`Saved pre-CAPTCHA screenshot to ${screenshotPath}`);
        } catch (e) {
          logger.error(`Failed to save pre-CAPTCHA screenshot: ${e.message}`);
        }
      }
      
      // Wait for CAPTCHA iframe to fully load
      logger.log("Waiting for CAPTCHA iframe to fully load...");
      await delay(3000);
      
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
            solved = await solveCaptcha(page, config.pageUrl, config.siteKey);
            
            if (solved) {
              logger.log(`Worker ${workerID}: CAPTCHA appears to be solved automatically for ${username} on attempt ${attempts}`);
              
              // Wait for the site to process the token and verify the solution worked
              logger.log("Waiting for CAPTCHA verification...");
              await delay(5000);
              
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
                
                return {
                  captchaPresent: captchaElements.length > 0,
                  successFound: successElements.length > 0
                };
              });
              
              if (!captchaStillPresent.captchaPresent || captchaStillPresent.successFound) {
                logger.log("CAPTCHA verification successful - CAPTCHA elements no longer visible");
                return true;
              }
              
              // If we're still here, the CAPTCHA might not have been properly verified
              logger.log("CAPTCHA may not have been properly verified, trying again...");
              solved = false;
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
        const screenshotPath = path.join(LOGS_DIR, `manual_captcha_${username}_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        logger.log(`Saved manual CAPTCHA screenshot to ${screenshotPath} - Please check this image`);
      } catch (e) {
        logger.error(`Failed to save manual CAPTCHA screenshot: ${e.message}`);
      }
      
      await waitForEnter();
      
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

// Function to simulate human-like mouse movements
async function simulateHumanMouseMovement(page, targetSelector) {
  try {
    await page.evaluate(async (selector) => {
      const target = document.querySelector(selector);
      if (!target) return false;
      
      const rect = target.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // Get current mouse position (or use a default)
      let currentX = window.innerWidth / 2;
      let currentY = window.innerHeight / 2;
      
      // Create a bezier curve path for mouse movement
      const bezierPoints = [];
      const controlPoint1X = currentX + (Math.random() * 100) - 50;
      const controlPoint1Y = currentY + (Math.random() * 100) - 50;
      const controlPoint2X = centerX + (Math.random() * 100) - 50;
      const controlPoint2Y = centerY + (Math.random() * 100) - 50;
      
      // Function to calculate point on bezier curve
      const bezier = (t, p0, p1, p2, p3) => {
        const cX = 3 * (p1 - p0);
        const bX = 3 * (p2 - p1) - cX;
        const aX = p3 - p0 - cX - bX;
        const cY = 3 * (p1 - p0);
        const bY = 3 * (p2 - p1) - cY;
        const aY = p3 - p0 - cY - bY;
        
        const x = (aX * Math.pow(t, 3)) + (bX * Math.pow(t, 2)) + (cX * t) + p0;
        const y = (aY * Math.pow(t, 3)) + (bY * Math.pow(t, 2)) + (cY * t) + p0;
        
        return { x, y };
      };
      
      // Generate points along the curve
      const steps = 10 + Math.floor(Math.random() * 10); // Random number of steps
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const point = bezier(
          t,
          { x: currentX, y: currentY },
          { x: controlPoint1X, y: controlPoint1Y },
          { x: controlPoint2X, y: controlPoint2Y },
          { x: centerX, y: centerY }
        );
        bezierPoints.push(point);
      }
      
      // Simulate mouse movement along the path
      for (const point of bezierPoints) {
        const event = new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          clientX: point.x,
          clientY: point.y
        });
        document.dispatchEvent(event);
        
        // Add random delay between movements
        await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 30));
      }
      
      return true;
    }, targetSelector);
  } catch (error) {
    logger.error(`Error simulating human mouse movement: ${error.message}`);
  }
}

// Function to simulate realistic typing
async function typeHumanLike(page, selector, text) {
  try {
    await page.focus(selector);
    
    // Type with variable speed
    for (let i = 0; i < text.length; i++) {
      await page.keyboard.press(text[i]);
      
      // Random delay between keystrokes (30-100ms)
      const delay = 30 + Math.floor(Math.random() * 70);
      await page.waitForTimeout(delay);
      
      // Occasionally pause for a longer time (like a human thinking)
      if (Math.random() < 0.1) {
        await page.waitForTimeout(200 + Math.random() * 300);
      }
    }
  } catch (error) {
    logger.error(`Error typing human-like: ${error.message}`);
    // Fall back to regular typing
    await page.type(selector, text);
  }
}

// Function to add common browser fingerprints
async function addBrowserFingerprints(page) {
  await page.evaluateOnNewDocument(() => {
    // Add common browser features
    const originalFunction = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type) {
      if (type === 'image/png' && this.width === 220 && this.height === 30) {
        // This is likely a fingerprinting attempt, return a random image
        return 'data:image/png;base64,' + Math.random().toString(36).substring(2);
      }
      return originalFunction.apply(this, arguments);
    };
    
    // Add common screen resolution
    Object.defineProperty(window.screen, 'width', { value: 1920 });
    Object.defineProperty(window.screen, 'height', { value: 1080 });
    Object.defineProperty(window.screen, 'availWidth', { value: 1920 });
    Object.defineProperty(window.screen, 'availHeight', { value: 1040 });
    Object.defineProperty(window.screen, 'colorDepth', { value: 24 });
    Object.defineProperty(window.screen, 'pixelDepth', { value: 24 });
    
    // Add timezone and locale
    Object.defineProperty(Intl, 'DateTimeFormat', {
      get: () => function(...args) {
        return {
          resolvedOptions: () => ({
            timeZone: 'Asia/Jakarta',
            locale: 'id-ID'
          })
        };
      }
    });
    
    // Add Chrome-specific properties
    window.chrome = {
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
      },
      runtime: {
        OnInstalledReason: {
          CHROME_UPDATE: 'chrome_update',
          INSTALL: 'install',
          SHARED_MODULE_UPDATE: 'shared_module_update',
          UPDATE: 'update'
        },
        OnRestartRequiredReason: {
          APP_UPDATE: 'app_update',
          OS_UPDATE: 'os_update',
          PERIODIC: 'periodic'
        },
        PlatformArch: {
          ARM: 'arm',
          ARM64: 'arm64',
          MIPS: 'mips',
          MIPS64: 'mips64',
          X86_32: 'x86-32',
          X86_64: 'x86-64'
        },
        PlatformNaclArch: {
          ARM: 'arm',
          MIPS: 'mips',
          MIPS64: 'mips64',
          X86_32: 'x86-32',
          X86_64: 'x86-64'
        },
        PlatformOs: {
          ANDROID: 'android',
          CROS: 'cros',
          LINUX: 'linux',
          MAC: 'mac',
          OPENBSD: 'openbsd',
          WIN: 'win'
        },
        RequestUpdateCheckStatus: {
          NO_UPDATE: 'no_update',
          THROTTLED: 'throttled',
          UPDATE_AVAILABLE: 'update_available'
        }
      }
    };
  });
}

// Function to load Chrome extensions
function getExtensionPaths() {
  try {
    if (!config.useExtensions || !config.extensionsPath || !fs.existsSync(config.extensionsPath)) {
      logger.log("Extensions not enabled or path not found");
      return [];
    }

    // Read all extension directories
    const extensions = fs.readdirSync(config.extensionsPath);
    const extensionPaths = [];

    // Get the latest version of each extension
    for (const ext of extensions) {
      const extPath = path.join(config.extensionsPath, ext);
      if (fs.statSync(extPath).isDirectory()) {
        try {
          // Get all version directories
          const versions = fs.readdirSync(extPath)
            .filter(v => {
              try {
                return fs.statSync(path.join(extPath, v)).isDirectory();
              } catch (err) {
                return false;
              }
            })
            .sort((a, b) => {
              // Sort by version number (assuming semantic versioning)
              const partsA = a.split('.').map(Number);
              const partsB = b.split('.').map(Number);
              
              for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
                const numA = partsA[i] || 0;
                const numB = partsB[i] || 0;
                if (numA !== numB) {
                  return numB - numA; // Descending order for latest version first
                }
              }
              return 0;
            });
          
          if (versions.length > 0) {
            // Use the latest version
            const latestVersion = versions[0];
            const fullExtPath = path.join(extPath, latestVersion);
            // Verify the path exists and is accessible
            if (fs.existsSync(fullExtPath)) {
              extensionPaths.push(fullExtPath);
            }
          }
        } catch (err) {
          logger.error(`Error processing extension ${ext}: ${err.message}`);
        }
      }
    }

    logger.log(`Loaded ${extensionPaths.length} Chrome extensions`);
    return extensionPaths;
  } catch (error) {
    logger.error(`Error loading extensions: ${error.message}`);
    return [];
  }
}

// Function to check if Chrome is accessible
async function isChromeLaunchable(chromePath) {
  try {
    if (!fs.existsSync(chromePath)) {
      logger.error(`Chrome executable not found at path: ${chromePath}`);
      return false;
    }
    
    // Try to access the file to check permissions
    fs.accessSync(chromePath, fs.constants.X_OK);
    return true;
  } catch (error) {
    logger.error(`Chrome access error: ${error.message}`);
    return false;
  }
}

// Account creation function
async function createAccount(username, password, workerNumber = 0) {
  stats.attempted++;
  const proxy = getRandomProxy();
  let browser = null;
  let page = null;

  try {
    // Create a unique profile directory for this account if enabled
    let profileDir = null;
    if (config.useProfileDir !== false) {
      profileDir = path.join(PROFILES_DIR, `profile_${username}`);
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
    const extensionPaths = config.useExtensions ? getExtensionPaths() : [];
    
    // Launch browser with proxy if available and use the profile directory
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
      useChrome = await isChromeLaunchable(config.chromePath);
      if (useChrome) {
        launchOptions.executablePath = config.chromePath;
      } else {
        logger.log("Falling back to bundled Chromium");
      }
    }

    if (proxy) {
      launchOptions.args.push(`--proxy-server=${proxy}`);
      logger.log(`Worker ${workerNumber}: Using proxy ${proxy}`);
    }

    // Try launching with all options first
    try {
      logger.log(`Worker ${workerNumber}: Launching browser with full options`);
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
    } catch (e) {
      logger.error(`Error adding browser fingerprints: ${e.message}`);
      // Continue even if fingerprinting fails
    }

    // Additional steps to avoid detection
    try {
      await page.evaluateOnNewDocument(() => {
        // Overwrite the 'webdriver' property to make it undefined
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });

        // Overwrite the plugins array with fake plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            return [
              {
                0: {
                  type: 'application/x-google-chrome-pdf',
                  suffixes: 'pdf',
                  description: 'Portable Document Format',
                  enabledPlugin: Plugin
                },
                description: 'Chrome PDF Plugin',
                filename: 'internal-pdf-viewer',
                length: 1,
                name: 'Chrome PDF Plugin'
              },
              {
                0: {
                  type: 'application/pdf',
                  suffixes: 'pdf',
                  description: 'Portable Document Format',
                  enabledPlugin: Plugin
                },
                description: 'Chrome PDF Viewer',
                filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
                length: 1,
                name: 'Chrome PDF Viewer'
              },
              {
                0: {
                  type: 'application/x-nacl',
                  suffixes: '',
                  description: 'Native Client Executable',
                  enabledPlugin: Plugin
                },
                1: {
                  type: 'application/x-pnacl',
                  suffixes: '',
                  description: 'Portable Native Client Executable',
                  enabledPlugin: Plugin
                },
                description: 'Native Client',
                filename: 'internal-nacl-plugin',
                length: 2,
                name: 'Native Client'
              }
            ];
          }
        });

        // Add language and platform
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        });

        // Modify the permissions behavior
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => {
          if (parameters.name === 'notifications') {
            return Promise.resolve({ state: Notification.permission });
          }
          return originalQuery(parameters);
        };
      });
    } catch (e) {
      logger.error(`Error setting up anti-detection: ${e.message}`);
      // Continue even if anti-detection setup fails
    }

    // Enable request interception to find CAPTCHA resources
    try {
      await page.setRequestInterception(true);
    } catch (e) {
      logger.error(`Error setting up request interception: ${e.message}`);
      // If request interception fails, try to continue without it
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
    logger.log(`Worker ${workerNumber}: Creating account ${username}`);
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
        const screenshotPath = path.join(LOGS_DIR, `before_signup_${username}_${Date.now()}.png`);
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
        await handleCaptcha(page, username, workerNumber);
      } else if (captchaResources.length > 0) {
        logger.log(`Worker ${workerNumber}: CAPTCHA detected via network requests`);
        await handleCaptcha(page, username, workerNumber);
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
        const screenshotPath = path.join(LOGS_DIR, `success_${username}_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath });
        logger.log(`Saved success screenshot to ${screenshotPath}`);
      } catch (e) {
        logger.error(`Failed to save success screenshot: ${e.message}`);
      }
    }
    
    // Save the successful account
    fs.appendFileSync(config.outputFile, `${username}:${password}\n`);
    stats.successful++;
    logger.log(`Worker ${workerNumber}: Successfully created account ${username}`);
    
    return true;
  } catch (error) {
    stats.failed++;
    logger.error(`Worker ${workerNumber}: Failed to create account ${username}: ${error.message}`);
    
    // Take a screenshot of failure state if possible
    try {
      if (page) {
        const screenshotPath = path.join(LOGS_DIR, `error_${username}_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath });
        logger.log(`Saved error screenshot to ${screenshotPath}`);
      }
    } catch (e) {
      // Screenshot failed, just log it
      logger.error(`Failed to save error screenshot: ${e.message}`);
    }
    
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

// Main function
async function main() {
  // Display starting banner
  logger.log('==================================');
  logger.log('ROBLOX ACCOUNT CREATOR - ENHANCED');
  logger.log('==================================');
  logger.log(`Configuration: ${JSON.stringify(config, null, 2)}`);
  
  // Determine if we're in sequential, cluster, or single mode
  if (config.urutName) {
    logger.log('Running in sequential mode');
    for (let i = config.startIndex; i <= config.endIndex; i++) {
      const username = `${config.baseName}${i}`;
      let success = false;
      let attempts = 0;
      
      // Retry logic
      while (!success && attempts < Math.max(1, config.retryAttempts || 1)) {
        attempts++;
        if (attempts > 1) {
          logger.log(`Retry attempt ${attempts} for account ${username}`);
          await delay(3000); // Wait before retry
        }
        
        success = await createAccount(username, config.password);
      }
      
      // Add random delay between attempts
      const delayTime = config.delayBetweenAccounts || 3000 + Math.random() * 5000;
      logger.log(`Waiting ${Math.round(delayTime/1000)}s before next account...`);
      await delay(delayTime);
      
      // Show current statistics
      const elapsedSeconds = Math.round((Date.now() - stats.startTime) / 1000);
      logger.log(`Progress: ${i-config.startIndex+1}/${config.endIndex-config.startIndex+1} accounts (${stats.successful} successful, ${stats.failed} failed) - Time: ${elapsedSeconds}s`);
    }
  } else if (cluster.isMaster && config.threads > 1) {
    // Multi-threaded mode
    const numCPUs = Math.min(os.cpus().length, config.threads || 2);
    logger.log(`Running in multi-threaded mode with ${numCPUs} workers`);
    
    // Track active workers
    let activeWorkers = 0;
    const workerResults = {
      attempted: 0,
      successful: 0,
      failed: 0
    };
    
    // Message handler for worker communication
    cluster.on('message', (worker, message) => {
      if (message.type === 'stats') {
        workerResults.attempted += message.attempted || 0;
        workerResults.successful += message.successful || 0;
        workerResults.failed += message.failed || 0;
        logger.log(`Worker ${worker.process.env.WORKER_ID} completed: ${message.successful} successful, ${message.failed} failed`);
      }
    });
    
    // Create workers
    for (let i = 0; i < numCPUs; i++) {
      const worker = cluster.fork({ WORKER_ID: i });
      activeWorkers++;
    }
    
    // Handle worker exit
    cluster.on('exit', (worker, code, signal) => {
      logger.log(`Worker ${worker.process.env.WORKER_ID} exited with code ${code}`);
      activeWorkers--;
      
      // When all workers are done, show final stats
      if (activeWorkers === 0) {
        // Update main stats with worker results
        stats.attempted = workerResults.attempted;
        stats.successful = workerResults.successful;
        stats.failed = workerResults.failed;
        
        // Show final statistics
        const elapsedSeconds = Math.round((Date.now() - stats.startTime) / 1000);
        logger.log('==================================');
        logger.log(`ALL WORKERS COMPLETED: Created ${stats.successful}/${stats.attempted} accounts (${stats.failed} failed)`);
        logger.log(`Total time: ${elapsedSeconds} seconds`);
        logger.log('==================================');
      }
    });
    
    // Don't continue to the next part in the master process
    return;
  } else {
    // Worker process or single account mode
    const workerID = process.env.WORKER_ID || 0;
    let username = config.baseName;
    
    if (config.randomizeName) {
      username = generateReadableName(config.baseName);
    }
    
    let success = false;
    let attempts = 0;
    
    // Retry logic for single account mode
    while (!success && attempts < Math.max(1, config.retryAttempts || 1)) {
      attempts++;
      if (attempts > 1) {
        logger.log(`Worker ${workerID}: Retry attempt ${attempts} for account ${username}`);
        await delay(3000); // Wait before retry
      }
      
      success = await createAccount(username, config.password, workerID);
    }
    
    // If we're a worker, send results back to master
    if (process.env.WORKER_ID) {
      if (process.send) {
        process.send({ 
          type: 'stats',
          attempted: stats.attempted,
          successful: stats.successful,
          failed: stats.failed
        });
      }
      process.exit(0);
    }
  }
  
  // Show final statistics
  const elapsedSeconds = Math.round((Date.now() - stats.startTime) / 1000);
  logger.log('==================================');
  logger.log(`COMPLETED: Created ${stats.successful}/${stats.attempted} accounts (${stats.failed} failed)`);
  logger.log(`Total time: ${elapsedSeconds} seconds`);
  logger.log('==================================');
  
  // Close the readline interface if we're using it
    rl.close();
}

// Start the application
main().catch(error => {
  logger.error(`Application error: ${error.message}`);
  process.exit(1);
});
