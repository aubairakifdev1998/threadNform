import { Inject, Injectable } from '@nestjs/common';
import {
  STORAGE_REPOSITORY,
  type StorageRepository,
} from '../../../domain/repositories/storage.repository.js';

@Injectable()
export class GetFileUrlUseCase {
  constructor(
    @Inject(STORAGE_REPOSITORY)
    private readonly storageRepository: StorageRepository,
  ) {}

  execute(bucket: string, path: string, signed = false, expiresIn = 3600) {
    if (signed) {
      return this.storageRepository.createSignedUrl(bucket, path, expiresIn);
    }
    return this.storageRepository.getPublicUrl(bucket, path);
  }
}
