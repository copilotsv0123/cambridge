import {
  Controller,
  Get,
  Query,
  ValidationPipe,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { ScraperService } from './scraper.service';
import { ScrapeWordDto } from './dto/scrape-word.dto';

@ApiTags('Dictionary')
@Controller('api/dictionary')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Get(':language/:word')
  @ApiOperation({
    summary: 'Tra cứu từ điển Cambridge',
    description:
      'Lấy thông tin từ vựng từ Cambridge Dictionary bao gồm phát âm, định nghĩa, ví dụ và verb forms',
  })
  @ApiParam({
    name: 'language',
    required: true,
    description: 'Ngôn ngữ tra cứu',
    enum: ['en', 'uk', 'en-tw', 'en-cn'],
    example: 'en',
  })
  @ApiParam({
    name: 'word',
    required: true,
    description: 'Từ cần tra cứu',
    example: 'class',
  })
  @ApiResponse({
    status: 200,
    description: 'Tra cứu thành công',
    schema: {
      example: {
        word: 'class',
        pos: ['noun', 'verb'],
        verbs: [
          {
            id: 0,
            type: 'simple present',
            text: 'class',
          },
        ],
        pronunciation: [
          {
            pos: 'noun',
            lang: 'us',
            url: 'https://dictionary.cambridge.org/us/media/english/us_pron/c/cla/class/class.mp3',
            pron: 'klæs',
          },
        ],
        definition: [
          {
            id: 0,
            pos: 'noun',
            source: 'english',
            text: 'a group of students who are taught together at school, college, or university',
            translation: '',
            example: [
              {
                id: 0,
                text: 'We were in the same class at school.',
                translation: '',
              },
            ],
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy từ',
  })
  @ApiResponse({
    status: 400,
    description: 'Tham số không hợp lệ',
  })
  async getDictionary(
    @Param('language') language: string,
    @Param('word') word: string,
  ) {
    // Validate language
    const validLanguages = ['en', 'uk', 'en-tw', 'en-cn'];
    if (!validLanguages.includes(language)) {
      throw new Error('Unsupported language');
    }

    return this.scraperService.getDictionary(word, language);
  }
}
