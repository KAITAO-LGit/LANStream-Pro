/**
 * LANStream Pro - Build Script
 * Usage:
 *   node build.js                Full build
 *   node build.js --clean-only   Clean only
 *   node build.js --skip-deps    Skip npm install
 *   node build.js --skip-ffmpeg  Skip FFmpeg download
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

// ==================== Config ====================
const projectRoot = path.resolve(__dirname);
const distDir = path.join(projectRoot, 'dist');
const buildDir = path.join(projectRoot, 'build');

const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const PROD_DEPS = pkg.dependencies || {};

const SOURCE_ITEMS = [
  'server.js', 'routes', 'utils', 'config', 'middleware',
  'public', 'requirements.txt', 'LICENSE', 'README.md'
];

const RUNTIME_DIRS = ['data', 'logs', 'uploads'];

// Colors
const c = {
  reset: '\x1b[0m', green: '\x1b[32m', blue: '\x1b[34m',
  yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', dim: '\x1b[2m'
};
const log = (msg, color) => console.log((c[color] || c.reset) + msg + c.reset);
const step = (msg) => log('\n[BUILD] ' + msg, 'cyan');
const ok = (msg) => log('  [OK] ' + msg, 'green');
const warn = (msg) => log('  [WARN] ' + msg, 'yellow');
const err = (msg) => log('  [ERR] ' + msg, 'red');
const info = (msg) => log('  [INFO] ' + msg, 'blue');

// Args
const args = process.argv.slice(2);
const CLEAN_ONLY = args.includes('--clean-only');
const SKIP_DEPS = args.includes('--skip-deps');
const SKIP_FFMPEG = args.includes('--skip-ffmpeg');

// ==================== Steps ====================

async function clean() {
  step('Cleaning build directories');
  for (const dir of [distDir, buildDir]) {
    if (await fs.pathExists(dir)) {
      await fs.remove(dir);
      info('Removed ' + path.basename(dir) + '/');
    }
  }
  await fs.ensureDir(distDir);
  await fs.ensureDir(buildDir);
  ok('Clean complete');
}

async function copySource() {
  step('Copying source files');
  for (const item of SOURCE_ITEMS) {
    const src = path.join(projectRoot, item);
    const dest = path.join(distDir, item);
    if (await fs.pathExists(src)) {
      await fs.copy(src, dest);
      info('Copied ' + item);
    } else {
      warn('Skipped missing: ' + item);
    }
  }
  ok('Source copy complete');
}

async function createRuntimeDirs() {
  step('Creating runtime directories');
  for (const dir of RUNTIME_DIRS) {
    const dirPath = path.join(distDir, dir);
    await fs.ensureDir(dirPath);
    await fs.writeFile(path.join(dirPath, '.gitkeep'), '');
  }
  ok('Created: ' + RUNTIME_DIRS.join(', '));
}

async function createPackageJson() {
  step('Generating dist/package.json');
  const distPkg = {
    name: pkg.name,
    version: VERSION,
    description: pkg.description,
    main: 'server.js',
    scripts: {
      start: 'node server.js',
      dev: 'node server.js --env=development'
    },
    dependencies: PROD_DEPS,
    keywords: pkg.keywords,
    author: pkg.author,
    license: pkg.license
  };
  await fs.writeJson(path.join(distDir, 'package.json'), distPkg, { spaces: 2 });
  ok('package.json generated (' + Object.keys(PROD_DEPS).length + ' prod deps)');
}

async function createConfig() {
  step('Generating config template');
  const config = {
    app: { name: 'LANStream Pro', version: VERSION, port: 3000 },
    database: { sqlite: { path: './data/lanstream.db' } },
    security: {
      jwt: { secret: 'REPLACE_WITH_SECURE_RANDOM_TOKEN', expiresIn: '2h' }
    },
    upload: { storagePath: './uploads', maxFileSize: 5368709120 }
  };
  await fs.writeJson(path.join(distDir, 'config.json'), config, { spaces: 2 });
  ok('config.json generated');
  warn('Replace security.jwt.secret before first start');
}

async function createScripts() {
  step('Creating startup scripts');

  const startBat = '@echo off\n'
    + 'chcp 65001 >nul\n'
    + 'title LANStream Pro v' + VERSION + '\n'
    + 'echo ============================================\n'
    + 'echo   LANStream Pro v' + VERSION + '\n'
    + 'echo   LAN Video Streaming & File Manager\n'
    + 'echo ============================================\n'
    + 'echo.\n'
    + 'echo Starting service...\n'
    + 'echo.\n'
    + 'set NODE_ENV=production\n'
    + 'node server.js\n'
    + 'if errorlevel 1 (\n'
    + '    echo.\n'
    + '    echo [ERROR] Startup failed, check logs above\n'
    + '    pause\n'
    + '    exit /b 1\n'
    + ')\n'
    + 'pause\n';

  const stopBat = '@echo off\n'
    + 'echo Stopping LANStream Pro...\n'
    + 'taskkill /F /IM node.exe 2>nul\n'
    + 'echo Service stopped.\n'
    + 'timeout /t 2 >nul\n';

  const installBat = '@echo off\n'
    + 'chcp 65001 >nul\n'
    + 'echo ============================================\n'
    + 'echo   LANStream Pro v' + VERSION + ' - Setup\n'
    + 'echo ============================================\n'
    + 'echo.\n'
    + 'where node >nul 2>nul\n'
    + 'if errorlevel 1 (\n'
    + '    echo [ERROR] Node.js not found\n'
    + '    echo Install Node.js 18 LTS or later\n'
    + '    echo Download: https://nodejs.org/\n'
    + '    pause\n'
    + '    exit /b 1\n'
    + ')\n'
    + 'echo [1/2] Node.js detected, installing production deps...\n'
    + 'call npm install --production\n'
    + 'if errorlevel 1 (\n'
    + '    echo [ERROR] Dependency install failed\n'
    + '    pause\n'
    + '    exit /b 1\n'
    + ')\n'
    + 'echo [2/2] Dependencies installed!\n'
    + 'echo.\n'
    + 'echo ============================================\n'
    + 'echo   Setup complete!\n'
    + 'echo   Double-click start.bat to launch\n'
    + 'echo   Open http://localhost:3000\n'
    + 'echo ============================================\n'
    + 'pause\n';

  await fs.writeFile(path.join(distDir, 'start.bat'), startBat);
  await fs.writeFile(path.join(distDir, 'stop.bat'), stopBat);
  await fs.writeFile(path.join(distDir, 'install.bat'), installBat);
  ok('start.bat / stop.bat / install.bat created');
}

async function downloadFFmpeg() {
  if (SKIP_FFMPEG) {
    step('Skipping FFmpeg (--skip-ffmpeg)');
    return;
  }
  step('Checking FFmpeg');
  const binDir = path.join(distDir, 'bin');
  const ffmpegPath = path.join(binDir, 'ffmpeg.exe');

  const localFfmpeg = path.join(projectRoot, 'bin', 'ffmpeg.exe');
  if (await fs.pathExists(localFfmpeg)) {
    await fs.ensureDir(binDir);
    await fs.copy(localFfmpeg, ffmpegPath);
    const localFfprobe = path.join(projectRoot, 'bin', 'ffprobe.exe');
    if (await fs.pathExists(localFfprobe)) {
      await fs.copy(localFfprobe, path.join(binDir, 'ffprobe.exe'));
    }
    ok('Copied FFmpeg from project bin/');
    return;
  }

  if (await fs.pathExists(ffmpegPath)) {
    ok('FFmpeg already exists in dist/bin/');
    return;
  }

  warn('FFmpeg not found - video transcoding will be unavailable');
  info('Download: https://www.gyan.dev/ffmpeg/builds/');
  info('Place ffmpeg.exe and ffprobe.exe in dist/bin/');
}

async function installDependencies() {
  if (SKIP_DEPS) {
    step('Skipping dependency install (--skip-deps)');
    return;
  }
  step('Installing production dependencies');
  try {
    info('Running npm install --production ...');
    execSync('npm install --production', { cwd: distDir, stdio: 'inherit' });
    ok('Production dependencies installed');
  } catch (e) {
    warn('Dependency install failed: ' + e.message);
    warn('Run npm install --production manually in dist/');
  }
}

async function validate() {
  step('Validating build output');
  const required = [
    'server.js', 'package.json', 'config.json',
    'start.bat', 'install.bat',
    'routes', 'utils', 'config', 'middleware', 'public'
  ];
  let allOk = true;
  for (const item of required) {
    const p = path.join(distDir, item);
    if (await fs.pathExists(p)) {
      info('  OK  ' + item);
    } else {
      err('  MISSING: ' + item);
      allOk = false;
    }
  }
  if (allOk) ok('Build validation passed');
  else warn('Build validation found missing files');
  return allOk;
}

// ==================== Main ====================

async function build() {
  const startTime = Date.now();
  log('\n' + '='.repeat(52), 'cyan');
  log('  LANStream Pro v' + VERSION + ' - Build', 'cyan');
  log('='.repeat(52), 'cyan');

  await clean();
  if (CLEAN_ONLY) {
    log('\nClean-only mode done.\n', 'green');
    return;
  }

  await copySource();
  await createRuntimeDirs();
  await createPackageJson();
  await createConfig();
  await createScripts();
  await downloadFFmpeg();
  await installDependencies();
  const valid = await validate();

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const statusText = valid ? 'Build complete' : 'Build complete (with warnings)';
  const statusColor = valid ? 'green' : 'yellow';
  log('\n' + '='.repeat(52), statusColor);
  log('  ' + statusText + '  Duration: ' + duration + 's', statusColor);
  log('='.repeat(52), statusColor);
  log('\nOutput: dist/', 'blue');
  log('To run:', 'blue');
  log('  1. cd dist', 'dim');
  log('  2. npm install --production  (if not auto-installed)', 'dim');
  log('  3. Edit config.json - set JWT secret', 'dim');
  log('  4. start.bat  or  node server.js', 'dim');
  log('  5. Open http://localhost:3000\n', 'dim');
}

build().catch(e => {
  err('Build exception: ' + e.message);
  console.error(e.stack);
  process.exit(1);
});
