import fs from 'fs';
import path from 'path';
import cluster from 'cluster';
import os from 'os';
import readline from 'readline';

import config from './utils/config.js';
import logger from './utils/logger.js';
import { createAccount } from './accountCreator.js';
import { delay, generateReadableName, loadProxies } from './utils/helpers.js';

// Create profiles directory if it doesn't exist
const PROFILES_DIR = './profiles';
if (!fs.existsSync(PROFILES_DIR)) {
  fs.mkdirSync(PROFILES_DIR);
}

// Statistics tracking
const stats = {
  attempted: 0,
  successful: 0,
  failed: 0,
  startTime: Date.now()
};

// Load proxies
const proxies = loadProxies(logger);

/**
 * Main function to run the application
 */
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
        
        success = await createAccount(username, config.password, config, logger, proxies);
        
        // Update stats
        stats.attempted++;
        if (success) {
          stats.successful++;
        } else {
          stats.failed++;
        }
      }
      
      // Add random delay between attempts
      const delayTime = config.delayBetweenAccounts || 3000 + Math.random() * 5000;
      logger.log(`Waiting ${Math.round(delayTime/1000)}s before next account...`);
      await delay(delayTime);
      
      // Show current statistics
      const elapsedSeconds = Math.round((Date.now() - stats.startTime) / 1000);
      logger.log(`Progress: ${i-config.startIndex+1}/${config.endIndex-config.startIndex+1} accounts (${stats.successful} successful, ${stats.failed} failed) - Time: ${elapsedSeconds}s`);
    }
  } else if (cluster.isPrimary && config.threads > 1) {
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
      
      success = await createAccount(username, config.password, config, logger, proxies, workerID);
      
      // Update stats
      stats.attempted++;
      if (success) {
        stats.successful++;
      } else {
        stats.failed++;
      }
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
}

// Start the application
main().catch(error => {
  logger.error(`Application error: ${error.message}`);
  process.exit(1);
}); 