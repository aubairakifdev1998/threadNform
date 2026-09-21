import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { memoryStorage } from 'multer';
import { DeleteFileUseCase } from '../../application/use-cases/storage/delete-file.use-case.js';
import { GetFileUrlUseCase } from '../../application/use-cases/storage/get-file-url.use-case.js';
import { UploadFileUseCase } from '../../application/use-cases/storage/upload-file.use-case.js';
import { ValidationException } from '../../domain/exceptions/domain.exception.js';
import {
  ADMIN_USER_REPOSITORY,
  type AdminUserRepository,
} from '../../domain/repositories/admin-user.repository.js';
import {
  COMMERCE_REPOSITORY,
  type CommerceRepository,
} from '../../domain/repositories/commerce.repository.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { User } from '../../domain/entities/user.entity.js';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard.js';
import { assertSafeStoragePath } from '../commerce/order-access.js';
import { DeleteFilesDto } from './dto/delete-files.dto.js';
import { GetFileUrlDto } from './dto/get-file-url.dto.js';

const PROOF_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

@Controller('storage')
@UseGuards(SupabaseAuthGuard)
export class StorageController {
  constructor(
    private readonly uploadFile: UploadFileUseCase,
    private readonly getFileUrl: GetFileUrlUseCase,
    private readonly deleteFile: DeleteFileUseCase,
    private readonly config: ConfigService,
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: AdminUserRepository,
  ) {}

  private productsBucket() {
    return this.config.getOrThrow<string>('supabase.storageBucket');
  }

  private proofsBucket() {
    return (
      this.config.get<string>('supabase.paymentProofsBucket') ?? 'payment-proofs'
    );
  }

  private allowedBuckets() {
    return new Set([this.productsBucket(), this.proofsBucket()]);
  }

  private async isAdmin(userId: string) {
    const admin = await this.admins.findById(userId);
    return Boolean(admin && admin.status === 'ACTIVE');
  }

  private async assertProofFolderAccess(user: User, folder: string) {
    const match = /^orders\/([^/]+)\/?$/.exec(folder.replace(/\\/g, '/'));
    if (!match) {
      throw new ValidationException(
        'Payment proofs must use folder orders/{orderNumber}',
        'INVALID_STORAGE_FOLDER',
      );
    }
    const orderNumber = match[1];
    const order = await this.commerce.getOrderByNumber(orderNumber);
    if (!order) {
      throw new ValidationException('Order not found', 'NOT_FOUND');
    }
    if (await this.isAdmin(user.id)) return;
    if (order.customerId && order.customerId !== user.id) {
      throw new ValidationException('Forbidden', 'FORBIDDEN');
    }
    if (
      !order.customerId &&
      user.email.trim().toLowerCase() !== order.email.toLowerCase()
    ) {
      throw new ValidationException(
        'Sign in with the checkout email to upload proof',
        'FORBIDDEN',
      );
    }
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize:
          Number(process.env.MAX_UPLOAD_BYTES) > 0
            ? Number(process.env.MAX_UPLOAD_BYTES)
            : 50 * 1024 * 1024,
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('bucket') bucket: string | undefined,
    @Body('folder') folder: string | undefined,
    @CurrentUser() user: User,
  ) {
    if (!file) {
      throw new ValidationException('File is required');
    }

    const resolvedBucket = bucket || this.productsBucket();
    if (!this.allowedBuckets().has(resolvedBucket)) {
      throw new ValidationException('Bucket not allowed', 'BUCKET_FORBIDDEN');
    }

    const proofsBucket = this.proofsBucket();
    if (resolvedBucket === proofsBucket) {
      const max = this.config.get<number>('maxUploadBytes') ?? 10_485_760;
      if (file.size > max) {
        throw new ValidationException('File too large', 'PAYLOAD_TOO_LARGE');
      }
      if (!PROOF_MIME.has(file.mimetype)) {
        throw new ValidationException(
          'Unsupported media type',
          'UNSUPPORTED_MEDIA_TYPE',
        );
      }
      if (!folder) {
        throw new ValidationException(
          'Folder is required for payment proofs',
          'INVALID_STORAGE_FOLDER',
        );
      }
      const safeFolder = assertSafeStoragePath(
        folder.endsWith('/') ? folder : `${folder}/`,
        'orders/',
      ).replace(/\/$/, '');
      await this.assertProofFolderAccess(user, safeFolder);
      return this.uploadFile.execute({
        bucket: resolvedBucket,
        folder: safeFolder,
        fileName: file.originalname,
        body: file.buffer,
        contentType: file.mimetype,
      });
    }

    // Product / media uploads — admin only
    if (!(await this.isAdmin(user.id))) {
      throw new ValidationException('Admin access required', 'FORBIDDEN');
    }

    return this.uploadFile.execute({
      bucket: resolvedBucket,
      folder,
      fileName: file.originalname,
      body: file.buffer,
      contentType: file.mimetype,
    });
  }

  @Get('url')
  async url(@Query() query: GetFileUrlDto, @CurrentUser() user: User) {
    if (!this.allowedBuckets().has(query.bucket)) {
      throw new ValidationException('Bucket not allowed', 'BUCKET_FORBIDDEN');
    }

    if (query.bucket === this.proofsBucket()) {
      const path = assertSafeStoragePath(query.path, 'orders/');
      const orderNumber = path.split('/')[1];
      const order = await this.commerce.getOrderByNumber(orderNumber);
      if (!order) throw new ValidationException('Order not found', 'NOT_FOUND');
      const admin = await this.isAdmin(user.id);
      const owner = order.customerId === user.id;
      const emailOwner =
        !order.customerId &&
        user.email.trim().toLowerCase() === order.email.toLowerCase();
      if (!admin && !owner && !emailOwner) {
        throw new ValidationException('Forbidden', 'FORBIDDEN');
      }
      const url = await this.getFileUrl.execute(
        query.bucket,
        path,
        true,
        60 * 60,
      );
      return { url };
    }

    if (!(await this.isAdmin(user.id))) {
      throw new ValidationException('Admin access required', 'FORBIDDEN');
    }
    const url = await this.getFileUrl.execute(
      query.bucket,
      query.path,
      query.signed ?? false,
    );
    return { url };
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Body() dto: DeleteFilesDto, @CurrentUser() user: User) {
    if (!this.allowedBuckets().has(dto.bucket)) {
      throw new ValidationException('Bucket not allowed', 'BUCKET_FORBIDDEN');
    }
    if (!(await this.isAdmin(user.id))) {
      throw new ValidationException('Admin access required', 'FORBIDDEN');
    }
    await this.deleteFile.execute(dto.bucket, dto.paths);
  }
}
