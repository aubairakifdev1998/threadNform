import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetFileUrlDto {
  @IsString()
  @MinLength(1)
  bucket: string;

  @IsString()
  @MinLength(1)
  path: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  signed?: boolean;
}
