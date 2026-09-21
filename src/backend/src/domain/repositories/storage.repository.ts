import type { StoredFile } from '../entities/stored-file.entity.js';

export type UploadFileInput = {
  bucket: string;
  path: string;
  body: Buffer;
  contentType: string;
  upsert?: boolean;
};

export interface StorageRepository {
  upload(input: UploadFileInput): Promise<StoredFile>;
  getPublicUrl(bucket: string, path: string): Promise<string>;
  createSignedUrl(
    bucket: string,
    path: string,
    expiresInSeconds: number,
  ): Promise<string>;
  delete(bucket: string, paths: string[]): Promise<void>;
}

export const STORAGE_REPOSITORY = Symbol('STORAGE_REPOSITORY');
