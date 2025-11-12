#!/usr/bin/env node

/**
 * Graphex Server Shutdown Script
 * Gracefully stops all services with beautiful console output
 */

const { spawn, exec } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');
const boxen = require('boxen');
const figlet = require('figlet');
const gradient = require('gradient-string');

// Service configuration (in reverse order)
const SERVICES = [
  {
    name: 'API Server',
    command: 'lsof -ti:3000 | xargs kill -9 2>/dev/null || true',
    icon: '🚀',
    color: 'green'
  },
  {
    name: 'Background Workers',
    command: 'pkill -f "node.*worker" 2>/dev/null || true',
    icon: '⚙️',
    color: 'yellow'
  },
  {
    name: 'Docker Services',
    command: 'docker-compose',
    args: ['down'],
    icon: '🐳',
    color: 'cyan'
  }
];

// Utility functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const printBanner = () => {
  console.clear();
  const banner = figlet.textSync('STOP', {
    font: 'ANSI Shadow',
    horizontalLayout: 'fitted'
  });
  console.log(gradient(['#FF6B6B', '#FFA500', '#FFD93D']).multiline(banner));
  console.log();
  console.log(boxen(
    chalk.white.bold('Graphex Server Shutdown') + '\n' +
    chalk.gray('Stopping all services gracefully...'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'yellow',
      align: 'center'
    }
  ));
  console.log();
};

const stopService = async (service) => {
  const spinner = ora({
    text: `${service.icon}  Stopping ${chalk[service.color].bold(service.name)}`,
    color: service.color
  }).start();

  try {
    return new Promise((resolve) => {
      if (service.args) {
        // Use spawn for commands with args
        const proc = spawn(service.command, service.args, {
          stdio: 'pipe',
          shell: true
        });

        let output = '';
        let errorOutput = '';

        proc.stdout.on('data', (data) => {
          output += data.toString();
        });

        proc.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        proc.on('close', (code) => {
          if (code === 0 || output.includes('done') || output.includes('Removed')) {
            spinner.succeed(`${service.icon}  ${chalk[service.color].bold(service.name)} ${chalk.gray('stopped')}`);
            resolve(true);
          } else {
            spinner.info(`${service.icon}  ${service.name} ${chalk.gray('not running')}`);
            resolve(true); // Don't fail if service wasn't running
          }
        });

        proc.on('error', () => {
          spinner.info(`${service.icon}  ${service.name} ${chalk.gray('not running')}`);
          resolve(true);
        });
      } else {
        // Use exec for shell commands
        exec(service.command, (error, stdout, stderr) => {
          if (error && error.code !== 0 && error.code !== 1) {
            // Code 1 is often "no process found" which is okay
            spinner.warn(`${service.icon}  ${service.name} ${chalk.yellow('warning')}: ${error.message}`);
          } else {
            spinner.succeed(`${service.icon}  ${chalk[service.color].bold(service.name)} ${chalk.gray('stopped')}`);
          }
          resolve(true);
        });
      }
    });
  } catch (error) {
    spinner.fail(`${service.icon}  ${service.name} ${chalk.red('error')}: ${error.message}`);
    return false;
  }
};

const checkRunningProcesses = async () => {
  return new Promise((resolve) => {
    exec('docker ps --format "{{.Names}}"', (error, stdout) => {
      if (error) {
        resolve([]);
        return;
      }
      const containers = stdout.trim().split('\n').filter(Boolean);
      resolve(containers);
    });
  });
};

// Main shutdown sequence
const main = async () => {
  printBanner();

  const startTime = Date.now();

  // Check what's running
  const runningContainers = await checkRunningProcesses();

  if (runningContainers.length === 0) {
    console.log(boxen(
      chalk.yellow.bold('ℹ No services running') + '\n\n' +
      chalk.gray('All services are already stopped'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
        align: 'center'
      }
    ));
    process.exit(0);
  }

  // Show what will be stopped
  console.log(chalk.gray(`Found ${runningContainers.length} running container(s)`));
  console.log();

  // Stop services in order
  for (const service of SERVICES) {
    await stopService(service);
    await sleep(500);
  }

  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log();
  console.log(chalk.gray(`Stopped in ${elapsedTime}s`));
  console.log();

  // Final cleanup check
  const remainingContainers = await checkRunningProcesses();

  if (remainingContainers.length === 0) {
    console.log(boxen(
      chalk.green.bold('✓ All services stopped successfully') + '\n\n' +
      chalk.gray('All containers and processes have been shut down'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'green',
        align: 'center'
      }
    ));
  } else {
    console.log(boxen(
      chalk.yellow.bold('⚠ Some services still running') + '\n\n' +
      chalk.gray('Remaining: ') + chalk.white(remainingContainers.join(', ')) + '\n\n' +
      chalk.gray('Try: docker-compose down --volumes'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
        align: 'center'
      }
    ));
  }
};

// Run
main().catch((error) => {
  console.error(chalk.red.bold('Fatal error:'), error);
  process.exit(1);
});
