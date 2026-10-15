module.exports = {
  apps: [
    {
      name: 'supdance-ai-studio',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --hostname 127.0.0.1 --port 3100',
      cwd: '/home/wwwroot/AI/domain/supdance.com/web',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3100,
        HOSTNAME: '127.0.0.1'
      }
    }
  ]
};
