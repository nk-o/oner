import { execFile } from 'node:child_process';

// A command that is not on this machine. The source then reports itself off.
export class SourceOff extends Error {}

export function run(command, args, { signal, maxBuffer = 64 * 1024 * 1024, okCodes = [0] } = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { signal, maxBuffer, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (!err || okCodes.includes(err.code)) return resolve(stdout);
      if (err.code === 'ENOENT') return reject(new SourceOff(`${command} is not installed`));
      const line = String(stderr || err.message).trim().split('\n')[0];
      reject(new Error(line || `${command} failed`));
    });
  });
}
