import { extractDataExchangeBlob } from './captchaBase.js';

/**
 * Extract Roblox FunCaptcha data from the page
 * @param {Object} page - Puppeteer page object
 * @param {Object} config - Configuration object
 * @param {Object} logger - Logger instance
 * @returns {Object} CAPTCHA data
 */
export async function extractRobloxCaptchaData(page, config, logger) {
  try {
    logger.log("Attempting to extract Roblox FunCaptcha data");
    
    // First try to extract dataExchangeBlob from iframe
    if (config.funcaptchaOptions && config.funcaptchaOptions.autoParseBlob) {
      const blobData = await extractDataExchangeBlob(page);
      if (blobData) {
        logger.log("Found dataExchangeBlob from iframe");
        
        // Get the public key from config or try to extract it
        const publicKey = config.siteKey;
        
        return {
          publicKey: publicKey,
          surl: config.funcaptchaOptions.surl,
          data: {
            blob: blobData
          }
        };
      }
    }
    
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
        if (iframe.src && (iframe.src.includes('arkoselabs') || iframe.src.includes('funcaptcha') || iframe.src.includes('arkose'))) {
          // Found a FunCaptcha iframe, extract data from its URL
          try {
            const url = new URL(iframe.src);
            
            // Extract all query parameters
            const params = {};
            url.searchParams.forEach((value, key) => {
              params[key] = value;
            });
            
            // Check for dataExchangeBlob parameter (Roblox specific)
            let blobData = params.blob || url.searchParams.get('blob') || '';
            
            // Try to extract dataExchangeBlob if it exists
            const dataExchangeBlob = params.dataExchangeBlob || url.searchParams.get('dataExchangeBlob') || '';
            if (dataExchangeBlob && !blobData) {
              blobData = dataExchangeBlob;
            }
            
            return {
              publicKey: params.pk || params.publicKey || url.searchParams.get('pk') || url.searchParams.get('publicKey'),
              surl: url.origin,
              data: {
                blob: blobData,
                siteData: params.siteData || url.searchParams.get('siteData') || ''
              },
              sessionToken: params.session || url.searchParams.get('session') || '',
              iframe: iframe.src
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