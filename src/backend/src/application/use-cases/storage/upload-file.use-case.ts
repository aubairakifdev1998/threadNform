import { Inject, Injectable } from '@nestjs/common';
import {
  STORAGE_REPOSITORY,
  type StorageRepository,
} from '../../../domain/repositories/storage.repository.js';
import { ValidationException } from '../../../domain/exceptions/domain.exception.js';

export type UploadFileCommand = {
  bucket: string;
  folder?: string;
  fileName: string;
  body: Buffer;
  contentType: string;
};

@Injectable()
export class UploadFileUseCase {
  constructor(
    @Inject(STORAGE_REPOSITORY)
    private readonly storageRepository: StorageRepository,
  ) {}

  execute(command: UploadFileCommand) {
    if (!command.body.length) {
      throw new ValidationException('File content is empty');
    }

    const sanitizedName = command.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = command.folder
      ? `${command.folder.replace(/^\/|\/$/g, '')}/${Date.now()}-${sanitizedName}`
      : `${Date.now()}-${sanitizedName}`;

    return this.storageRepository.upload({
      bucket: command.bucket,
      path,
      body: command.body,
      contentType: command.contentType,
      upsert: false,
    });
  }
}
