import { Inject, Injectable } from '@nestjs/common';
import {
  STORAGE_REPOSITORY,
  type StorageRepository,
} from '../../../domain/repositories/storage.repository.js';

@Injectable()
export class DeleteFileUseCase {
  constructor(
    @Inject(STORAGE_REPOSITORY)
    private readonly storageRepository: StorageRepository,
  ) {}

  execute(bucket: string, paths: string[]) {
    return this.storageRepository.delete(bucket, paths);
  }
}
