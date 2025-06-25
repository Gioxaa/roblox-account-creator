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
    
    // Fill out the signup form
    console.log('Filling out the signup form...');
    
    // Fill out the birthday
    await page.select('#MonthDropdown', 'Mar');
    await page.select('#DayDropdown', '15');
    await page.select('#YearDropdown', '2005');
    
    // Fill out the username
    await page.type('#signup-username', 'TestUser' + Math.floor(Math.random() * 10000));
    
    // Fill out the password
    await page.type('#signup-password', 'TestPassword123!');
    
    // Click the signup button to trigger CAPTCHA
    console.log('Clicking signup button to trigger CAPTCHA...');
    await Promise.all([
      page.click('#signup-button'),
      // Wait for navigation or network activity
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
    ]);
    
    // Wait for CAPTCHA to potentially load
    console.log('Waiting for CAPTCHA to potentially load (10 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
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
      
      // Check for any elements with "captcha" in their attributes
      const captchaElements = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('*'));
        return elements
          .filter(el => {
            // Check if any attribute contains "captcha"
            for (const attr of el.attributes) {
              if (attr.name.toLowerCase().includes('captcha') || 
                  (attr.value && attr.value.toLowerCase().includes('captcha'))) {
                return true;
              }
            }
            // Check if id or class contains "captcha"
            return (el.id && el.id.toLowerCase().includes('captcha')) || 
                   (el.className && el.className.toLowerCase().includes('captcha'));
          })
          .map(el => ({
            tagName: el.tagName,
            id: el.id || 'no-id',
            className: el.className || 'no-class',
            attributes: Array.from(el.attributes).map(attr => `${attr.name}="${attr.value}"`).join(', ')
          }));
      });
      
      console.log('Elements with "captcha" in attributes:');
      console.log(JSON.stringify(captchaElements, null, 2));
      
      // Check page URL to see if we're still on the signup page
      const currentUrl = await page.url();
      console.log('Current page URL:', currentUrl);
    }
    
    console.log('Waiting for 20 more seconds before closing...');
    await new Promise(resolve => setTimeout(resolve, 20000));
    
    await browser.close();
    console.log('Browser closed.');
  } catch (error) {
    console.error('An error occurred:', error);
  }
})(); 