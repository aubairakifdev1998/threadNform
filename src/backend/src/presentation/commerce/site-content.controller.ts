import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Permission } from '../../domain/auth/permissions.js';
import {
  SITE_CONTENT_REPOSITORY,
  type SiteContentRepository,
} from '../../domain/repositories/site-content.repository.js';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';

class BillboardBodyDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() subtitle?: string | null;
  @IsOptional() @IsString() seasonLabel?: string | null;
  @IsOptional() @IsString() ctaLabel?: string;
  @IsOptional() @IsString() ctaHref?: string;
  @IsOptional() @IsString() secondaryCtaLabel?: string | null;
  @IsOptional() @IsString() secondaryCtaHref?: string | null;
  @IsOptional() @IsIn(['IMAGE', 'VIDEO', 'NONE']) mediaType?: 'IMAGE' | 'VIDEO' | 'NONE';
  @IsOptional() @IsString() mediaUrl?: string | null;
  @IsOptional() @IsString() posterUrl?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

class ReviewBodyDto {
  @IsString() customerName!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() title?: string | null;
  @IsString() body!: string;
  @IsOptional() @IsString() imageUrl?: string | null;
  @IsOptional() @IsString() location?: string | null;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

class ReviewPatchDto {
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @IsString() title?: string | null;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() imageUrl?: string | null;
  @IsOptional() @IsString() location?: string | null;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

@ApiTags('site-content')
@Controller()
export class SiteContentController {
  constructor(
    @Inject(SITE_CONTENT_REPOSITORY)
    private readonly siteContent: SiteContentRepository,
  ) {}

  @Get('site/billboard')
  getActiveBillboard() {
    return this.siteContent.getActiveBillboard();
  }

  @Get('site/reviews')
  listPublishedReviews() {
    return this.siteContent.listPublishedReviews();
  }

  @Get('admin/site/billboards')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  listBillboards() {
    return this.siteContent.listBillboards();
  }

  @Post('admin/site/billboards')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  upsertBillboard(@Body() dto: BillboardBodyDto) {
    return this.siteContent.upsertBillboard(dto);
  }

  @Post('admin/site/billboards/:id/activate')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  activateBillboard(@Param('id') id: string) {
    return this.siteContent.setActiveBillboard(id);
  }

  @Delete('admin/site/billboards/:id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async deleteBillboard(@Param('id') id: string) {
    await this.siteContent.deleteBillboard(id);
  }

  @Get('admin/site/reviews')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  listReviews() {
    return this.siteContent.listReviews();
  }

  @Post('admin/site/reviews')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  createReview(@Body() dto: ReviewBodyDto) {
    return this.siteContent.createReview({
      customerName: dto.customerName,
      rating: dto.rating,
      title: dto.title ?? null,
      body: dto.body,
      imageUrl: dto.imageUrl ?? null,
      location: dto.location ?? null,
      isPublished: dto.isPublished ?? false,
      sortOrder: dto.sortOrder ?? 0,
    });
  }

  @Patch('admin/site/reviews/:id')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  updateReview(@Param('id') id: string, @Body() dto: ReviewPatchDto) {
    return this.siteContent.updateReview(id, dto);
  }

  @Delete('admin/site/reviews/:id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async deleteReview(@Param('id') id: string) {
    await this.siteContent.deleteReview(id);
  }
}
