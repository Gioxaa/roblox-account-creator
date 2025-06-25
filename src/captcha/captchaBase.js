import fetch from 'node-fetch';
import { delay } from '../utils/helpers.js';

/**
 * Extract CAPTCHA details from network resources
 * @param {Object} page - Puppeteer page object
 * @returns {Object} CAPTCHA details
 */
export async function extractCaptchaDetailsFromNetwork(page) {
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
    console.error(`Error extracting CAPTCHA details from network: ${e.message}`);
    return null;
  }
}

/**
 * Extract the dataExchangeBlob from arkose iframe
 * @param {Object} page - Puppeteer page object
 * @returns {string|null} The blob data or null if not found
 */
export async function extractDataExchangeBlob(page) {
  try {
    console.log("Attempting to extract dataExchangeBlob from arkose iframe");
    
    const blobData = await page.evaluate(() => {
      // First check for the Roblox-specific arkose iframe
      const robloxArkoseIframe = document.querySelector('iframe[src*="www.roblox.com/arkose/iframe"]');
      if (robloxArkoseIframe) {
        console.log("Found Roblox-specific arkose iframe");
        try {
          const url = new URL(robloxArkoseIframe.src);
          const dataExchangeBlob = url.searchParams.get('dataExchangeBlob');
          if (dataExchangeBlob) {
            console.log("Found dataExchangeBlob from Roblox arkose iframe");
            return {
              type: 'roblox_dataExchangeBlob',
              data: dataExchangeBlob,
              source: robloxArkoseIframe.src
            };
          }
        } catch (e) {
          console.error("Error parsing Roblox iframe URL:", e);
        }
      }
      
      // Look for iframe with arkose in the src
      const iframes = Array.from(document.querySelectorAll('iframe'));
      for (const iframe of iframes) {
        if (iframe.src && 
           (iframe.src.includes('arkose') || 
            iframe.src.includes('funcaptcha') || 
            iframe.id === 'arkose-iframe' || 
            iframe.title === 'Challenge')) {
          
          try {
            console.log(`Examining iframe: ${iframe.src}`);
            const url = new URL(iframe.src);
            
            // First check for dataExchangeBlob parameter
            const dataExchangeBlob = url.searchParams.get('dataExchangeBlob');
            if (dataExchangeBlob) {
              console.log("Found dataExchangeBlob parameter");
              return {
                type: 'dataExchangeBlob',
                data: dataExchangeBlob,
                source: iframe.src
              };
            }
            
            // Then check for blob parameter
            const blob = url.searchParams.get('blob');
            if (blob) {
              console.log("Found blob parameter");
              return {
                type: 'blob',
                data: blob,
                source: iframe.src
              };
            }
            
            // Return the iframe source for debugging
            return {
              type: 'iframe_only',
              data: null,
              source: iframe.src
            };
          } catch (e) {
            console.error("Error parsing iframe URL:", e);
          }
        }
      }
      
      // Check for specific div that might contain the blob data
      const arkoseDiv = document.querySelector('#arkose');
      if (arkoseDiv && arkoseDiv.dataset && arkoseDiv.dataset.blob) {
        console.log("Found blob data in arkose div");
        return {
          type: 'div_data',
          data: arkoseDiv.dataset.blob,
          source: 'div#arkose'
        };
      }
      
      // Check for Roblox-specific FunCaptcha data in the page source
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const script of scripts) {
        const content = script.textContent || '';
        if (content.includes('dataExchangeBlob') || content.includes('arkoseLabs')) {
          const blobMatch = content.match(/dataExchangeBlob['"]\s*:\s*['"]([^'"]+)['"]/);
          if (blobMatch && blobMatch[1]) {
            console.log("Found dataExchangeBlob in script content");
            return {
              type: 'script_content',
              data: blobMatch[1],
              source: 'script_content'
            };
          }
        }
      }
      
      // Check for Roblox-specific global variables
      if (window.Roblox && window.Roblox.FunCaptcha) {
        const blob = window.Roblox.FunCaptcha.dataExchangeBlob || window.Roblox.FunCaptcha.blob;
        if (blob) {
          console.log("Found blob in Roblox.FunCaptcha global");
          return {
            type: 'roblox_global',
            data: blob,
            source: 'Roblox.FunCaptcha'
          };
        }
      }
      
      console.log("No blob data found in any source");
      return null;
    });
    
    if (blobData && blobData.data) {
      console.log(`Found ${blobData.type} data from ${blobData.source}`);
      return blobData.data;
    } else if (blobData) {
      console.log(`Found iframe but no blob data: ${blobData.source}`);
    } else {
      console.log("No arkose iframe or blob data found");
    }
    
    return null;
  } catch (e) {
    console.error(`Error extracting dataExchangeBlob: ${e.message}`);
    return null;
  }
}

/**
 * Monitor and debug CAPTCHA status
 * @param {Object} page - Puppeteer page object
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Object} CAPTCHA status information
 */
export async function monitorCaptchaStatus(page, timeout = 30000) {
  try {
    console.log("Starting CAPTCHA monitoring");
    
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
    
    console.log(`CAPTCHA monitoring: ${captchaMonitor}`);
    
    // Wait for the specified timeout
    await delay(timeout);
    
    // Collect debug information
    const captchaDebugInfo = await page.evaluate(() => {
      return window.__captchaDebug || { status: 'unknown', events: [], errors: [] };
    });
    
    console.log(`CAPTCHA status: ${captchaDebugInfo.status}`);
    if (captchaDebugInfo.iframe) {
      console.log(`CAPTCHA iframe found: ${captchaDebugInfo.iframe.src}`);
    }
    
    if (captchaDebugInfo.errors && captchaDebugInfo.errors.length > 0) {
      console.log(`CAPTCHA errors: ${captchaDebugInfo.errors.join(', ')}`);
    }
    
    return captchaDebugInfo;
  } catch (e) {
    console.error(`Error monitoring CAPTCHA: ${e.message}`);
    return { status: 'error', error: e.message };
  }
}

/**
 * Extract dataExchangeBlob specifically from Roblox signup page
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<string|null>} The blob data or null if not found
 */
export async function extractRobloxDataExchangeBlob(page) {
  try {
    console.log("Attempting to extract dataExchangeBlob specifically from Roblox signup page");
    
    const blobData = await page.evaluate(() => {
      // Method 1: Check for the Roblox-specific arkose iframe by ID
      console.log("Looking for Roblox-specific arkose iframe");
      
      // Try to find the iframe with ID "arkose-iframe"
      const arkoseIframe = document.getElementById('arkose-iframe');
      if (arkoseIframe && arkoseIframe.src) {
        console.log("Found arkose-iframe by ID");
        try {
          const url = new URL(arkoseIframe.src);
          const dataExchangeBlob = url.searchParams.get('dataExchangeBlob');
          if (dataExchangeBlob) {
            console.log("Found dataExchangeBlob in arkose-iframe");
            return {
              type: 'arkose_iframe_id',
              data: dataExchangeBlob,
              source: 'arkose-iframe'
            };
          }
        } catch (e) {
          console.error("Error parsing arkose-iframe URL:", e);
        }
      }
      
      // Method 2: Look for the iframe with specific src pattern
      const iframes = Array.from(document.querySelectorAll('iframe'));
      for (const iframe of iframes) {
        if (iframe.src && iframe.src.includes('roblox.com/arkose/iframe')) {
          console.log("Found Roblox arkose iframe by src");
          try {
            const url = new URL(iframe.src);
            const dataExchangeBlob = url.searchParams.get('dataExchangeBlob');
            if (dataExchangeBlob) {
              console.log("Found dataExchangeBlob in Roblox arkose iframe");
              return {
                type: 'roblox_arkose_iframe',
                data: dataExchangeBlob,
                source: iframe.src
              };
            }
          } catch (e) {
            console.error("Error parsing Roblox arkose iframe URL:", e);
          }
        }
      }
      
      // Method 3: Check for Roblox FunCaptcha global variables
      if (window.Roblox && window.Roblox.FunCaptcha) {
        console.log("Found Roblox.FunCaptcha global object");
        const blob = window.Roblox.FunCaptcha.dataExchangeBlob;
        if (blob) {
          console.log("Found dataExchangeBlob in Roblox.FunCaptcha global");
          return {
            type: 'roblox_global',
            data: blob,
            source: 'Roblox.FunCaptcha.dataExchangeBlob'
          };
        }
      }
      
      // Method 4: Check for FunCaptcha data in the page source
      const scripts = Array.from(document.querySelectorAll('script:not([src])'));
      for (const script of scripts) {
        const content = script.textContent || '';
        if (content.includes('dataExchangeBlob') || content.includes('arkoseLabs')) {
          console.log("Found script with dataExchangeBlob content");
          
          // Try to extract the dataExchangeBlob value
          const blobMatch = content.match(/dataExchangeBlob["']?\s*[:=]\s*["']([^"']+)["']/);
          if (blobMatch && blobMatch[1]) {
            console.log("Extracted dataExchangeBlob from script content");
            return {
              type: 'script_content',
              data: blobMatch[1],
              source: 'script_content'
            };
          }
        }
      }
      
      // Method 5: Try to find it in any meta tags
      const metaTags = Array.from(document.querySelectorAll('meta'));
      for (const meta of metaTags) {
        const content = meta.getAttribute('content') || '';
        if (content.includes('dataExchangeBlob=')) {
          console.log("Found meta tag with dataExchangeBlob");
          const blobMatch = content.match(/dataExchangeBlob=([^&]+)/);
          if (blobMatch && blobMatch[1]) {
            console.log("Extracted dataExchangeBlob from meta tag");
            return {
              type: 'meta_tag',
              data: blobMatch[1],
              source: 'meta_tag'
            };
          }
        }
      }
      
      // Method 6: Look for it in data attributes of elements
      const elementsWithData = Array.from(document.querySelectorAll('[data-exchange-blob], [data-blob]'));
      for (const element of elementsWithData) {
        const blob = element.getAttribute('data-exchange-blob') || element.getAttribute('data-blob');
        if (blob) {
          console.log("Found element with data-exchange-blob or data-blob attribute");
          return {
            type: 'data_attribute',
            data: blob,
            source: 'element_data_attribute'
          };
        }
      }
      
      // Method 7: Last resort - try to find it in any element with 'arkose' or 'captcha' in its ID or class
      const potentialElements = Array.from(document.querySelectorAll('[id*="arkose" i], [id*="captcha" i], [class*="arkose" i], [class*="captcha" i]'));
      for (const element of potentialElements) {
        // Check all attributes
        for (const attr of element.attributes) {
          if (attr.value && attr.value.includes('dataExchangeBlob')) {
            console.log(`Found dataExchangeBlob in ${attr.name} attribute of element`);
            const blobMatch = attr.value.match(/dataExchangeBlob=([^&]+)/);
            if (blobMatch && blobMatch[1]) {
              return {
                type: 'element_attribute',
                data: blobMatch[1],
                source: `element_${attr.name}`
              };
            }
          }
        }
      }
      
      console.log("Could not find dataExchangeBlob in any source");
      return null;
    });
    
    if (blobData && blobData.data) {
      console.log(`Found ${blobData.type} data from ${blobData.source}`);
      return blobData.data;
    } else if (blobData) {
      console.log(`Found element but no blob data: ${blobData.source}`);
    } else {
      console.log("No blob data found");
    }
    
    return null;
  } catch (e) {
    console.error(`Error extracting Roblox dataExchangeBlob: ${e.message}`);
    return null;
  }
}

/**
 * Monitor the page for the appearance of Roblox arkose iframe
 * @param {Object} page - Puppeteer page object
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<string|null>} The blob data or null if not found
 */
export async function monitorForRobloxArkoseIframe(page, timeout = 10000) {
  console.log(`Monitoring for Roblox arkose iframe (timeout: ${timeout}ms)`);
  
  try {
    // First check if it's already there
    const initialBlob = await extractRobloxDataExchangeBlob(page);
    if (initialBlob) {
      console.log("Found dataExchangeBlob immediately");
      return initialBlob;
    }
    
    // Set up a monitor to watch for iframe creation or modification
    const blobData = await page.evaluate((timeout) => {
      return new Promise((resolve) => {
        // Function to check for the iframe and extract blob
        const checkForArkoseIframe = () => {
          try {
            // Check for Roblox-specific arkose iframe
            const robloxArkoseIframe = document.querySelector('iframe[src*="www.roblox.com/arkose/iframe"]');
            if (robloxArkoseIframe && robloxArkoseIframe.src) {
              try {
                const url = new URL(robloxArkoseIframe.src);
                const dataExchangeBlob = url.searchParams.get('dataExchangeBlob');
                if (dataExchangeBlob) {
                  console.log("Found dataExchangeBlob in Roblox arkose iframe during monitoring");
                  return {
                    type: 'roblox_arkose_iframe',
                    data: dataExchangeBlob,
                    source: robloxArkoseIframe.src
                  };
                }
              } catch (e) {
                console.error("Error parsing Roblox iframe URL:", e);
              }
            }
            
            // Check for any iframe with arkose in the src
            const arkoseIframes = Array.from(document.querySelectorAll('iframe[src*="arkose"]'));
            for (const iframe of arkoseIframes) {
              if (iframe.src) {
                try {
                  const url = new URL(iframe.src);
                  const dataExchangeBlob = url.searchParams.get('dataExchangeBlob');
                  if (dataExchangeBlob) {
                    console.log("Found dataExchangeBlob in arkose iframe during monitoring");
                    return {
                      type: 'arkose_iframe',
                      data: dataExchangeBlob,
                      source: iframe.src
                    };
                  }
                } catch (e) {
                  console.error("Error parsing iframe URL:", e);
                }
              }
            }
            
            // Check for Roblox FunCaptcha global variables
            if (window.Roblox && window.Roblox.FunCaptcha) {
              const blob = window.Roblox.FunCaptcha.dataExchangeBlob;
              if (blob) {
                console.log("Found dataExchangeBlob in Roblox.FunCaptcha global during monitoring");
                return {
                  type: 'roblox_global',
                  data: blob,
                  source: 'Roblox.FunCaptcha.dataExchangeBlob'
                };
              }
            }
            
            return null;
          } catch (e) {
            console.error("Error in checkForArkoseIframe:", e);
            return null;
          }
        };
        
        // Check immediately
        const immediateResult = checkForArkoseIframe();
        if (immediateResult) {
          resolve(immediateResult);
          return;
        }
        
        // Set up observer to watch for iframe creation or modification
        const observer = new MutationObserver((mutations) => {
          const result = checkForArkoseIframe();
          if (result) {
            observer.disconnect();
            resolve(result);
          }
        });
        
        // Start observing the document
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['src']
        });
        
        // Set up periodic checks
        const interval = setInterval(() => {
          const result = checkForArkoseIframe();
          if (result) {
            clearInterval(interval);
            observer.disconnect();
            resolve(result);
          }
        }, 500);
        
        // Set timeout
        setTimeout(() => {
          clearInterval(interval);
          observer.disconnect();
          
          // One last check before giving up
          const finalResult = checkForArkoseIframe();
          resolve(finalResult || null);
        }, timeout);
      });
    }, timeout);
    
    if (blobData && blobData.data) {
      console.log(`Found ${blobData.type} data from ${blobData.source} during monitoring`);
      return blobData.data;
    } else {
      console.log("No blob data found during monitoring");
      return null;
    }
  } catch (e) {
    console.error(`Error monitoring for Roblox arkose iframe: ${e.message}`);
    return null;
  }
} 