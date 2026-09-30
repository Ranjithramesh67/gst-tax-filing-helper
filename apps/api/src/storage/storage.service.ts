import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { basename, join, resolve, sep } from 'path';
import { randomUUID } from 'crypto';

export interface SavedFile {
  storageKey: string;
  size: number;
}

@Injectable()
export class StorageService {
  constructor(private readonly config: ConfigService) {}

  private get rootDir(): string {
    return resolve(this.config.get<string>('STORAGE_LOCAL_DIR') ?? './uploads');
  }

  async save(buffer: Buffer, originalName: string): Promise<SavedFile> {
    const now = new Date();
    const keyDir = join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'));
    const storageKey = join(keyDir, `${randomUUID()}-${sanitiseFileName(originalName)}`);

    await mkdir(join(this.rootDir, keyDir), { recursive: true });
    await writeFile(join(this.rootDir, storageKey), buffer);

    return { storageKey, size: buffer.length };
  }

  resolvePath(storageKey: string): string {
    if (!storageKey || storageKey.includes('..')) {
      throw new BadRequestException('Invalid storage key');
    }
    const fullPath = resolve(this.rootDir, storageKey);
    const rootWithSep = this.rootDir.endsWith(sep) ? this.rootDir : `${this.rootDir}${sep}`;
    if (fullPath !== this.rootDir && !fullPath.startsWith(rootWithSep)) {
      throw new BadRequestException('Invalid storage key');
    }
    return fullPath;
  }

  getStream(storageKey: string): NodeJS.ReadableStream {
    const fullPath = this.resolvePath(storageKey);
    if (!existsSync(fullPath)) {
      throw new NotFoundException('Stored file not found');
    }
    return createReadStream(fullPath);
  }

  async delete(storageKey: string): Promise<void> {
    const fullPath = this.resolvePath(storageKey);
    if (existsSync(fullPath)) {
      await unlink(fullPath);
    }
  }
}

function sanitiseFileName(name: string): string {
  const base = basename(name.replace(/\\/g, '/'))
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '');
  return base.length > 0 ? base.slice(0, 200) : 'file';
}
