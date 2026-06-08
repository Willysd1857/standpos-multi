const { spawn } = require('child_process');
const fs = require('fs');

const outStream = fs.createWriteStream('build_output.txt');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

console.log(`Running: ${npx} electron-builder --win`);

const child = spawn(npx, ['electron-builder', '--win'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
});

child.stdout.on('data', (data) => {
    outStream.write(data);
    process.stdout.write(data);
});

child.stderr.on('data', (data) => {
    outStream.write(data);
    process.stderr.write(data);
});

child.on('close', (code) => {
    console.log(`Build process exited with code ${code}`);
    outStream.end();
});
