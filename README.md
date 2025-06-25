# Roblox Account Creator

An automated tool for creating Roblox accounts with CAPTCHA solving capabilities.

## Features

- Automated account creation on Roblox
- Supports both automatic and manual CAPTCHA solving
- Multiple CAPTCHA solving services support (2captcha, Anti-Captcha, CapMonster)
- Human-like behavior simulation
- Multi-threaded support for creating multiple accounts simultaneously
- Sequential mode for creating numbered accounts
- Proxy support
- Chrome/Chromium browser support with profile persistence
- Browser extension support
- Detailed logging and screenshots

## Project Structure

The project has been organized into a modular structure for better maintainability:

```
roblox_acc/
├── index.js                  # Main entry point
├── config.json               # Configuration file
├── proxies.txt               # Optional proxy list
├── logs/                     # Log files directory
├── profiles/                 # Browser profiles directory
└── src/                      # Source code directory
    ├── index.js              # Main application logic
    ├── accountCreator.js     # Account creation module
    ├── browser/              # Browser-related modules
    │   ├── browserLauncher.js # Browser launching utilities
    │   └── browserUtils.js   # Browser utilities
    ├── captcha/              # CAPTCHA-related modules
    │   ├── captchaBase.js    # Base CAPTCHA utilities
    │   ├── captchaExtractor.js # CAPTCHA data extraction
    │   ├── captchaHandler.js # CAPTCHA detection and handling
    │   └── captchaSolver.js  # CAPTCHA solving implementations
    └── utils/                # Utility modules
        ├── config.js         # Configuration loading
        ├── helpers.js        # Helper functions
        └── logger.js         # Logging utilities
```

## Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Configure the `config.json` file with your settings
4. (Optional) Add proxies to `proxies.txt` (one per line)

## Configuration

Edit the `config.json` file to configure the application:

```json
{
  "baseName": "ElentinalPo",         // Base username
  "randomizeName": true,             // Generate random usernames
  "urutName": false,                 // Sequential numbering mode
  "startIndex": 1,                   // Start index for sequential mode
  "endIndex": 10,                    // End index for sequential mode
  "password": "YourPassword123",     // Password for accounts
  "birthMonth": "Mar",               // Birth month for accounts
  "birthDay": "15",                  // Birth day for accounts
  "birthYear": "2005",               // Birth year for accounts
  "outputFile": "hasil_akun.txt",    // Output file for created accounts
  
  "captchaSolve": true,              // Enable automatic CAPTCHA solving
  "captchaApiKey": "your-api-key",   // Default CAPTCHA API key
  "siteKey": "A2A14B1D-1AF3-C791-9BBC-EE33C7C70A6F", // Roblox CAPTCHA site key
  "pageUrl": "https://www.roblox.com/", // Roblox signup URL
  
  "threads": 1,                      // Number of parallel threads
  "retryAttempts": 3,                // Retry attempts per account
  "delayBetweenAccounts": 5000,      // Delay between accounts (ms)
  "useProxies": false,               // Enable proxy usage
  "randomUserAgents": true,          // Use random user agents
  "enableLogging": true,             // Enable logging
  "verboseLog": true,                // Enable verbose logging
  "headless": false,                 // Run browser in headless mode
  
  "useChrome": false,                // Use Chrome instead of bundled Chromium
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", // Chrome path
  "useExtensions": false,            // Enable browser extensions
  "extensionsPath": "C:\\Users\\user\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Extensions", // Extensions path
  "useProfileDir": true,             // Save browser profiles
  
  "captchaService": "2captcha",      // Default CAPTCHA service
  "captchaServices": {               // CAPTCHA services configuration
    "2captcha": {
      "apiKey": "your-2captcha-key",
      "enabled": true
    },
    "anticaptcha": {
      "apiKey": "",
      "enabled": false
    },
    "capmonster": {
      "apiKey": "",
      "enabled": false
    }
  },
  "captchaMaxAttempts": 40,          // Max CAPTCHA solving attempts
  "captchaTimeout": 120000,          // CAPTCHA timeout (ms)
  "captchaRetryDelay": 5000,         // CAPTCHA retry delay (ms)
  "funcaptchaOptions": {             // FunCaptcha specific options
    "subdomain": "roblox-api.arkoselabs.com",
    "surl": "https://roblox-api.arkoselabs.com",
    "data": {
      "blob": ""
    },
    "autoParseBlob": true
  }
}
```

## Usage

Run the application:

```
npm start
```

For sequential mode (creating numbered accounts):
1. Set `urutName` to `true` in `config.json`
2. Set `startIndex` and `endIndex` to define the range

For single account mode:
1. Set `urutName` to `false` in `config.json`
2. Set `randomizeName` to `true` for random usernames or `false` to use the base name

For multi-threaded mode:
1. Set `threads` to a value greater than 1 in `config.json`

## CAPTCHA Solving

The application supports multiple CAPTCHA solving services:

1. **Automatic solving** using services like 2captcha, Anti-Captcha, or CapMonster
2. **Manual solving** as a fallback when automatic solving fails

To use automatic solving:
1. Set `captchaSolve` to `true`
2. Configure your preferred service in `captchaServices`
3. Provide valid API keys

## License

ISC 