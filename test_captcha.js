const puppeteer = require('puppeteer');

(async () => {
  try {
    console.log('Starting browser...');
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--start-maximized']
    });
    
    console.log('Opening new page...');
    const page = await browser.newPage();
    
    console.log('Navigating to Roblox signup page...');
    await page.goto('https://www.roblox.com/signup', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log('Page loaded, waiting for 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check for FunCaptcha iframe
    console.log('Checking for FunCaptcha iframe...');
    const funcaptchaIframe = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[src*="arkoselabs"]');
      if (iframe) {
        return {
          found: true,
          src: iframe.src
        };
      }
      return { found: false };
    });
    
    if (funcaptchaIframe.found) {
      console.log('FunCaptcha iframe found!');
      console.log('iframe src:', funcaptchaIframe.src);
    } else {
      console.log('FunCaptcha iframe not found.');
      
      // Check for any iframes
      const allIframes = await page.evaluate(() => {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        return iframes.map(iframe => ({
          src: iframe.src || 'no-src',
          id: iframe.id || 'no-id',
          className: iframe.className || 'no-class'
        }));
      });
      
      console.log('All iframes on the page:');
      console.log(JSON.stringify(allIframes, null, 2));
      
      // Check for captcha div elements
      const captchaDivs = await page.evaluate(() => {
        const divs = Array.from(document.querySelectorAll('div[data-sitekey], div[data-pkey], div[id*="captcha"], div[class*="captcha"]'));
        return divs.map(div => ({
          id: div.id || 'no-id',
          className: div.className || 'no-class',
          dataSitekey: div.getAttribute('data-sitekey') || 'none',
          dataPkey: div.getAttribute('data-pkey') || 'none'
        }));
      });
      
      console.log('Captcha div elements:');
      console.log(JSON.stringify(captchaDivs, null, 2));
    }
    
    console.log('Waiting for 10 more seconds before closing...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    await browser.close();
    console.log('Browser closed.');
  } catch (error) {
    console.error('An error occurred:', error);
  }
})(); 