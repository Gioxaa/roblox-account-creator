# Roblox Account Creator

Advanced automation tool for creating Roblox accounts with CAPTCHA solving capabilities.

## Features

- Automated account creation on Roblox
- Multi-threading support for parallel account creation
- Auto-generation of usernames
- FunCaptcha/Arkose Labs CAPTCHA support
- Proxy rotation support
- Human-like behavior with random delays
- Comprehensive error handling and retries
- Detailed logging system
- Chrome profile support to avoid bot detection
- Chrome extensions support
- Human-like mouse movements and typing

## Requirements

- Node.js (v14+)
- NPM
- Puppeteer
- 2captcha API key (for automatic CAPTCHA solving)
- Google Chrome (optional, for using real Chrome browser)

## Installation

1. Clone the repository:
```
git clone https://github.com/yourusername/roblox_acc.git
cd roblox_acc
```

2. Install dependencies:
```
npm install
```

3. Configure the settings in `config.json` (see Configuration section)

## Configuration

Edit the `config.json` file to adjust the script's behavior:

```json
{
  "baseName": "YourNamePrefix",     // Base name for generated accounts
  "randomizeName": true,            // Add random characters to base name
  "urutName": false,                // Use sequential numbering instead of random
  "startIndex": 1,                  // Starting index for sequential numbering
  "endIndex": 10,                   // Ending index for account creation
  "password": "YourPassword123",    // Password for created accounts
  "birthMonth": "Jan",              // Birth month (Jan, Feb, etc.)
  "birthDay": "1",                  // Birth day (1-31)
  "birthYear": "2000",              // Birth year (e.g., 2000)
  "outputFile": "accounts.txt",     // File to save created accounts
  "captchaSolve": true,             // Enable automatic CAPTCHA solving
  "captchaApiKey": "YOUR_API_KEY",  // 2captcha API key
  "siteKey": "A2A14B1D-1AF3-C791-9BBC-EE33CC7A0A6F",  // Roblox FunCaptcha key
  "pageUrl": "https://www.roblox.com/",  // Roblox URL
  "threads": 1,                     // Number of parallel browser instances
  "retryAttempts": 3,               // Max retry attempts for failed accounts
  "delayBetweenAccounts": 5000,     // Delay between account creations (ms)
  "useProxies": false,              // Use proxies for account creation
  "randomUserAgents": true,         // Randomize browser user agents
  "enableLogging": true,            // Enable detailed logs
  "verboseLog": true,               // Enable verbose logging
  "headless": false,                // Run browsers in headless mode
  "useChrome": true,                // Use real Chrome instead of Puppeteer's Chromium
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", // Path to Chrome executable
  "useExtensions": true,            // Use Chrome extensions
  "extensionsPath": "C:\\Users\\YourUsername\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Extensions", // Path to Chrome extensions
  "captchaService": "2captcha",     // CAPTCHA service to use
  "funcaptchaOptions": {            // Advanced FunCaptcha settings
    "subdomain": "arkoselabs.roblox.com",
    "surl": "https://arkoselabs.roblox.com",
    "data": {
      "blob": ""
    }
  }
}
```

## Chrome Profile and Anti-Detection Features

The script includes several features to avoid bot detection:

### Chrome Profiles

- Each account creation uses a separate Chrome profile stored in the `profiles/` directory
- Profiles persist between runs, allowing cookies and session data to be saved
- This makes the browser appear more like a regular user's browser

### Using Real Chrome

To use your installed Chrome browser instead of Puppeteer's bundled Chromium:

1. Set `useChrome` to `true` in config.json
2. Set `chromePath` to the path of your Chrome executable
   - Windows: Usually `C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe`
   - Mac: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
   - Linux: `/usr/bin/google-chrome`

### Chrome Extensions

You can use your existing Chrome extensions to further mask automation:

1. Set `useExtensions` to `true` in config.json
2. Set `extensionsPath` to the path of your Chrome extensions directory
   - Windows: `C:\\Users\\YourUsername\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Extensions`
   - Mac: `~/Library/Application Support/Google/Chrome/Default/Extensions`
   - Linux: `~/.config/google-chrome/Default/Extensions`

Useful extensions for avoiding detection:
- WebGL Fingerprint Defender
- Canvas Fingerprint Defender
- AudioContext Fingerprint Defender

### Human-Like Behavior

The script simulates human behavior to avoid detection:

- Realistic mouse movements using bezier curves
- Variable typing speed with random pauses
- Random scrolling and interactions
- Fingerprint spoofing

## CAPTCHA Handling

The script supports automatic solving of Arkose Labs FunCaptcha which Roblox uses for verification:

1. **Automatic Solving**: Uses the 2captcha service. You must provide your own API key in the config.
2. **Manual Fallback**: If automatic solving fails, the script will prompt for manual intervention.

### CAPTCHA Configuration

- The script automatically detects Roblox's CAPTCHA parameters from the page.
- The configuration has default values for Roblox, but you can adjust them if needed.
- Most CAPTCHA-related settings are in the `funcaptchaOptions` section of the config file.

### Troubleshooting CAPTCHA

If you're having issues with the CAPTCHA:

- Make sure your 2captcha API key is valid and has funds 
- Check the `logs/` directory for screenshots and error messages
- Try enabling `verboseLog` to see detailed CAPTCHA detection process
- Try different values for the `subdomain` setting if automatic detection fails

## Proxy Support

Add proxies to `proxies.txt`, one per line in format `ip:port` or `ip:port:username:password`

## Usage

Start the account generator:

```
npm start
```

## Disclaimer

This tool is provided for educational purposes only. Use responsibly and in accordance with Roblox's Terms of Service. 