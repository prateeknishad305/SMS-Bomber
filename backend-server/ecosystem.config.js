module.exports = {
  apps: [
    {
      name: 'sms-bomber-api',
      script: 'dist/app.js',
      instances: 'max',
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3001
      },
      env_test: {
        NODE_ENV: 'test',
        PORT: 3002
      },
      error_file: '/var/log/sms-bomber/err.log',
      out_file: '/var/log/sms-bomber/out.log',
      log_file: '/var/log/sms-bomber/combined.log',
      time: true,
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true,
      min_uptime: '5s',
      max_restarts: 10
    },
    {
      name: 'sms-bomber-worker',
      script: 'dist/workers/smsWorker.js',
      instances: 2,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      },
      env_staging: {
        NODE_ENV: 'staging'
      },
      error_file: '/var/log/sms-bomber/worker-err.log',
      out_file: '/var/log/sms-bomber/worker-out.log',
      time: true,
      kill_timeout: 5000,
      listen_timeout: 5000,
      max_restarts: 10
    },
    {
      name: 'sms-bomber-cleanup',
      script: 'dist/workers/cleanupWorker.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      cron_restart: '0 0 * * *', // Run daily at midnight
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/var/log/sms-bomber/cleanup-err.log',
      out_file: '/var/log/sms-bomber/cleanup-out.log',
      time: true
    }
  ],
  
  deploy: {
    staging: {
      user: 'deploy',
      host: 'staging.smsbomber.com',
      ref: 'origin/develop',
      repo: 'git@github.com:yourusername/sms-bomber-system.git',
      path: '/var/www/staging/sms-bomber',
      'post-deploy': 'cd backend-server && npm install && npm run build && pm2 reload ecosystem.config.js --env staging',
      env: {
        NODE_ENV: 'staging'
      }
    },
    production: {
      user: 'deploy',
      host: 'api.smsbomber.com',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/sms-bomber-system.git',
      path: '/var/www/production/sms-bomber',
      'post-deploy': 'cd backend-server && npm install --production && npm run build && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production'
      },
      'pre-deploy': 'cd backend-server && npm run migrate:prod',
      'post-deploy': 'cd backend-server && npm run seed:prod'
    }
  }
};
