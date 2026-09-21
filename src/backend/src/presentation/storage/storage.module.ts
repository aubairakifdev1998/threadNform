import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DeleteFileUseCase } from '../../application/use-cases/storage/delete-file.use-case.js';
import { GetFileUrlUseCase } from '../../application/use-cases/storage/get-file-url.use-case.js';
import { UploadFileUseCase } from '../../application/use-cases/storage/upload-file.use-case.js';
import { SupabaseModule } from '../../infrastructure/supabase/supabase.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StorageController } from './storage.controller.js';

@Module({
  imports: [SupabaseModule, AuthModule, ConfigModule],
  controllers: [StorageController],
  providers: [UploadFileUseCase, GetFileUrlUseCase, DeleteFileUseCase],
  exports: [GetFileUrlUseCase, UploadFileUseCase, DeleteFileUseCase],
})
export class StorageModule {}
