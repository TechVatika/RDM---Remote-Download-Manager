module.exports = {
  apps: [
    {
      name: 'rdm-backend',
      cwd: '/mnt/4tb-1/RDM/backend',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        EMBED_WORKER: 'false',
        PATH: '/home/h33t/.local/bin:/usr/local/bin:/usr/bin:/bin',
      },
      autorestart: true,
      max_restarts: 20,
      min_uptime: 10000,
      restart_delay: 3000,
    },
    {
      name: 'rdm-worker',
      cwd: '/mnt/4tb-1/RDM/backend',
      script: 'npm',
      args: 'run worker',
      env: {
        NODE_ENV: 'production',
        PATH: '/home/h33t/.local/bin:/usr/local/bin:/usr/bin:/bin',
      },
      autorestart: true,
      max_restarts: 20,
      min_uptime: 10000,
      restart_delay: 3000,
    },
    {
      name: 'rdm-frontend',
      cwd: '/mnt/4tb-1/RDM/frontend',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
