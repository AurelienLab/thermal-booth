<?php
namespace Deployer;

require 'recipe/laravel.php';

// Config

set('repository', 'git@github.com:AurelienLab/thermal-booth.git');
set('branch', 'main');
set('sub_directory', 'backend');

add('shared_files', ['.env']);
add('shared_dirs', ['storage']);
add('writable_dirs', ['bootstrap/cache', 'storage']);

set('keep_releases', 3);

set('allow_anonymous_stats', false);

// Hosts
host('prod')
    ->set('hostname', '192.168.1.114')
    ->set('port', 22)
    ->set('remote_user', 'verti')
    ->set('deploy_path', '/srv/web/thermal-booth');


// Tasks

desc('Install npm dependencies');
task('npm:install', function () {
    run('source ~/.nvm/nvm.sh && cd {{release_path}} && nvm install && nvm use && npm ci');
});

desc('Build frontend assets');
task('npm:build', function () {
    run('source ~/.nvm/nvm.sh && cd {{release_path}} && nvm install && nvm use && npm run build');
});

desc('Prune devDependencies after build');
task('npm:prune', function () {
    run('source ~/.nvm/nvm.sh && cd {{release_path}} && nvm use && npm prune --production');
});

desc('Restart Reverb via PM2');
task('reverb:restart', function () {
    // Always use deploy_path/current since ecosystem.config.js points there anyway
    $path = '{{deploy_path}}/current';
    // Delete old process if exists, then start fresh from ecosystem config
    run('source ~/.nvm/nvm.sh && pm2 delete reverb 2>/dev/null || true');
    run("source ~/.nvm/nvm.sh && cd $path && pm2 start ecosystem.config.cjs");
    run('source ~/.nvm/nvm.sh && pm2 save');
});

// Hooks
before('deploy:symlink', 'npm:install');
after('npm:install', 'npm:build');
after('npm:build', 'npm:prune');
after('deploy:symlink', 'reverb:restart');
after('deploy:failed', 'deploy:unlock');
