import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class ScrapeWordDto {
  @ApiProperty({
    description: 'Từ cần tra cứu',
    example: 'class',
  })
  @IsString()
  @IsNotEmpty()
  word: string;

  @ApiProperty({
    description: 'Ngôn ngữ tra cứu',
    example: 'en',
    enum: ['en', 'uk', 'en-tw', 'en-cn'],
    required: false,
    default: 'en',
  })
  @IsOptional()
  @IsIn(['en', 'uk', 'en-tw', 'en-cn'])
  language?: string = 'en';
}
