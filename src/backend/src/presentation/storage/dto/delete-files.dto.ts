import { ArrayMinSize, IsArray, IsString, MinLength } from 'class-validator';

export class DeleteFilesDto {
  @IsString()
  @MinLength(1)
  bucket: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  paths: string[];
}
