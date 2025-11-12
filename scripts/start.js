#!/usr/bin/env node

/**
 * Graphex Server Startup Script
 * Starts all services with beautiful console output
 */

const { spawn } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');
const boxen = require('boxen');
const figlet = require('figlet');
const gradient = require('gradient-string');

// Service configuration
const SERVICES = {
  docker: {
    name: 'Docker Services',
    command: 'docker-compose',
    args: ['up', '-d', 'postgres', 'redis'],
    checkCommand: 'docker',
    checkArgs: ['ps', '--format', '{{.Names}}'],
    icon: '🐳',
    color: 'cyan'
  },
  database: {
    name: 'Database Migration',
    command: 'npm',
    args: ['run', 'prisma:deploy'],
    icon: '🗄️',
    color: 'blue',
    dependsOn: ['docker']
  },
  api: {
    name: 'API Server',
    command: 'npm',
    args: ['run', 'dev'],
    icon: '🚀',
    color: 'green',
    dependsOn: ['database']
  }
};

// Utility functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const printBanner = () => {
  console.clear();
  const banner = figlet.textSync('GRAPHEX', {
    font: 'ANSI Shadow',
    horizontalLayout: 'fitted'
  });
  console.log(gradient.pastel.multiline(banner));
  console.log();
  console.log(boxen(
    chalk.white.bold('Knowledge Graph Learning Platform') + '\n' +
    chalk.gray('Starting all services...'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
      align: 'center'
    }
  ));
  console.log();
};

const checkServiceStatus = async (service) => {
  if (!service.checkCommand) return true;

  return new Promise((resolve) => {
    const check = spawn(service.checkCommand, service.checkArgs);
    let output = '';

    check.stdout.on('data', (data) => {
      output += data.toString();
    });

    check.on('close', (code) => {
      if (service.name === 'Docker Services') {
        // Check if postgres and redis are running
        resolve(output.includes('postgres') && output.includes('redis'));
      } else {
        resolve(code === 0);
      }
    });

    check.on('error', () => resolve(false));
  });
};

const checkPortInUse = (port) => {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    exec(`lsof -ti:${port}`, (error, stdout) => {
      resolve(stdout.trim().length > 0);
    });
  });
};

const startService = async (serviceName) => {
  const service = SERVICES[serviceName];
  const spinner = ora({
    text: `${service.icon}  Starting ${chalk[service.color].bold(service.name)}`,
    color: service.color
  }).start();

  try {
    // Check dependencies
    if (service.dependsOn) {
      for (const dep of service.dependsOn) {
        const depService = SERVICES[dep];
        spinner.text = `${service.icon}  Waiting for ${depService.name}...`;
        let attempts = 0;
        const maxAttempts = 30;

        while (attempts < maxAttempts) {
          const isReady = await checkServiceStatus(depService);
          if (isReady) break;
          await sleep(1000);
          attempts++;
        }

        if (attempts >= maxAttempts) {
          spinner.fail(`${service.icon}  ${service.name} - dependency ${depService.name} not ready`);
          return false;
        }
      }
    }

    spinner.text = `${service.icon}  Starting ${service.name}...`;

    return new Promise((resolve) => {
      const proc = spawn(service.command, service.args, {
        stdio: serviceName === 'api' ? 'inherit' : 'pipe',
        shell: true,
        env: { ...process.env, FORCE_COLOR: '1' }
      });

      if (serviceName === 'api') {
        // API server runs indefinitely
        spinner.succeed(`${service.icon}  ${chalk[service.color].bold(service.name)} ${chalk.green('started')}`);
        console.log();
        console.log(boxen(
          chalk.green.bold('✓ All services running!') + '\n\n' +
          chalk.white('API Server: ') + chalk.cyan.underline('http://localhost:4000') + '\n' +
          chalk.white('Health Check: ') + chalk.cyan.underline('http://localhost:4000/health') + '\n' +
          chalk.white('API Docs: ') + chalk.cyan.underline('See API_REFERENCE.md') + '\n\n' +
          chalk.gray('Press Ctrl+C to stop all services'),
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green',
            align: 'center'
          }
        ));

        // Handle Ctrl+C
        process.on('SIGINT', async () => {
          console.log('\n');
          spinner.info(chalk.yellow('Shutting down...'));
          proc.kill();
          process.exit(0);
        });

        resolve(true);
      } else {
        let output = '';
        let errorOutput = '';

        proc.stdout?.on('data', (data) => {
          output += data.toString();
        });

        proc.stderr?.on('data', (data) => {
          errorOutput += data.toString();
        });

        proc.on('close', (code) => {
          if (code === 0 || (serviceName === 'docker' && output.includes('up-to-date'))) {
            spinner.succeed(`${service.icon}  ${chalk[service.color].bold(service.name)} ${chalk.green('ready')}`);
            resolve(true);
          } else {
            spinner.fail(`${service.icon}  ${service.name} ${chalk.red('failed')} (code: ${code})`);
            if (errorOutput) {
              console.log(chalk.red(errorOutput));
            }
            resolve(false);
          }
        });

        proc.on('error', (err) => {
          spinner.fail(`${service.icon}  ${service.name} ${chalk.red('error')}: ${err.message}`);
          resolve(false);
        });
      }
    });
  } catch (error) {
    spinner.fail(`${service.icon}  ${service.name} ${chalk.red('error')}: ${error.message}`);
    return false;
  }
};

// Main startup sequence
const main = async () => {
  printBanner();

  // Check if API server is already running
  const port = process.env.PORT || 4000;
  const portInUse = await checkPortInUse(port);

  if (portInUse) {
    console.log(boxen(
      chalk.yellow.bold('⚠ Services Already Running') + '\n\n' +
      chalk.white('API Server is already running on port ') + chalk.cyan(port) + '\n\n' +
      chalk.gray('To restart:\n') +
      chalk.white('  1. npm run down\n') +
      chalk.white('  2. npm run up\n\n') +
      chalk.gray('Or use: ') + chalk.cyan('npm run restart'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
        align: 'center'
      }
    ));

    console.log();
    console.log(chalk.green('✓ API Server: ') + chalk.cyan.underline(`http://localhost:${port}`));
    console.log(chalk.green('✓ Health Check: ') + chalk.cyan.underline(`http://localhost:${port}/health`));
    console.log();
    process.exit(0);
  }

  const startTime = Date.now();

  // Start services in order
  const dockerSuccess = await startService('docker');
  if (!dockerSuccess) {
    console.log();
    console.log(chalk.red.bold('✗ Failed to start Docker services'));
    console.log(chalk.yellow('  Make sure Docker is running and try again'));
    process.exit(1);
  }

  await sleep(2000); // Give Docker services time to initialize

  const dbSuccess = await startService('database');
  if (!dbSuccess) {
    console.log();
    console.log(chalk.yellow.bold('⚠ Database migration skipped'));
    console.log(chalk.gray('  Run manually: npm run prisma:migrate:dev'));
  }

  await sleep(1000);

  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log();
  console.log(chalk.gray(`Started in ${elapsedTime}s`));
  console.log();

  // Start API server (this will block)
  await startService('api');
};

// Run
main().catch((error) => {
  console.error(chalk.red.bold('Fatal error:'), error);
  process.exit(1);
});
