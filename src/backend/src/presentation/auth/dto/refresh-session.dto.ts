import { IsString, MinLength } from 'class-validator';

export class RefreshSessionDto {
  @IsString()
  @MinLength(10)
  refreshToken: string;
}
