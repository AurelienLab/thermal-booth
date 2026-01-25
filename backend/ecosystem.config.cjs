module.exports = {
    apps: [
        {
            name: 'reverb',
            script: 'artisan',
            args: 'reverb:start',
            interpreter: 'php',
            cwd: '/srv/web/thermal-booth/current',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '256M',
            env: {
                APP_ENV: 'production',
            },
        },
    ],
};
