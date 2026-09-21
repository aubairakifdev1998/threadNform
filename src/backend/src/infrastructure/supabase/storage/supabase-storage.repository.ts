import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { StoredFile } from '../../../domain/entities/stored-file.entity.js';
import { DomainException } from '../../../domain/exceptions/domain.exception.js';
import type {
  StorageRepository,
  UploadFileInput,
} from '../../../domain/repositories/storage.repository.js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase.tokens.js';

@Injectable()
export class SupabaseStorageRepository implements StorageRepository {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async upload(input: UploadFileInput): Promise<StoredFile> {
    const { data, error } = await this.supabase.storage
      .from(input.bucket)
      .upload(input.path, input.body, {
        contentType: input.contentType,
        upsert: input.upsert ?? false,
      });

    if (error || !data) {
      throw new DomainException(
        error?.message ?? 'Failed to upload file',
        'STORAGE_ERROR',
      );
    }

    const publicUrl = await this.getPublicUrl(input.bucket, data.path);

    return new StoredFile(
      data.path,
      input.bucket,
      publicUrl,
      input.body.length,
      input.contentType,
    );
  }

  async getPublicUrl(bucket: string, path: string): Promise<string> {
    const { data } = this.supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  async createSignedUrl(
    bucket: string,
    path: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new DomainException(
        error?.message ?? 'Failed to create signed URL',
        'STORAGE_ERROR',
      );
    }

    return data.signedUrl;
  }

  async delete(bucket: string, paths: string[]): Promise<void> {
    const { error } = await this.supabase.storage.from(bucket).remove(paths);

    if (error) {
      throw new DomainException(error.message, 'STORAGE_ERROR');
    }
  }
}
