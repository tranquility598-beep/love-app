module.exports = {
  apps: [
    {
      name: 'love-backend',
      cwd: '/var/www/love-current',
      script: 'server/index.js',
      interpreter: '/opt/love-node/bin/node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      kill_timeout: 10000,
      listen_timeout: 15000,
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};

