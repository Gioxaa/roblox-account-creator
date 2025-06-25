import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

/**
 * Add common browser fingerprints to avoid detection
 * @param {Object} page - Puppeteer page object
 */
export async function addBrowserFingerprints(page) {
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

/**
 * Add anti-detection measures to the page
 * @param {Object} page - Puppeteer page object
 */
export async function addAntiDetection(page) {
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
    console.error(`Error setting up anti-detection: ${e.message}`);
  }
}

/**
 * Simulate human-like mouse movements
 * @param {Object} page - Puppeteer page object
 * @param {string} targetSelector - CSS selector for target element
 */
export async function simulateHumanMouseMovement(page, targetSelector) {
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
    console.error(`Error simulating human mouse movement: ${error.message}`);
  }
}

/**
 * Type text with human-like delays
 * @param {Object} page - Puppeteer page object
 * @param {string} selector - CSS selector for input element
 * @param {string} text - Text to type
 */
export async function typeHumanLike(page, selector, text) {
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
    console.error(`Error typing human-like: ${error.message}`);
    // Fall back to regular typing
    await page.type(selector, text);
  }
}

/**
 * Get Chrome extension paths
 * @param {Object} config - Configuration object
 * @param {Object} logger - Logger instance
 * @returns {Array} List of extension paths
 */
export function getExtensionPaths(config, logger) {
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

/**
 * Check if Chrome is accessible
 * @param {string} chromePath - Path to Chrome executable
 * @param {Object} logger - Logger instance
 * @returns {Promise<boolean>} Whether Chrome is launchable
 */
export async function isChromeLaunchable(chromePath, logger) {
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