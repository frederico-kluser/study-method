/**
 * tests/_helpers/fs.ts — helpers de filesystem para os testes.
 * Diretórios temporários SEMPRE por aqui (nada é criado fora de tmp).
 */
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

export async function mkTempDir(prefix = 'study-method-gui-'): Promise<string> {
  return fsp.mkdtemp(path.join(tmpdir(), prefix));
}

export async function rmrf(dir: string): Promise<void> {
  await fsp.rm(dir, { recursive: true, force: true });
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, content, 'utf8');
}

export async function readFile(filePath: string): Promise<string> {
  return fsp.readFile(filePath, 'utf8');
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}