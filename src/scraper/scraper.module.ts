import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ScraperController } from './scraper.controller';
import { ScraperService } from './scraper.service';

@Module({
  imports: [
    CacheModule.register({
      ttl: 1800000, // 30 minutes in milliseconds
      max: 1000, // maximum number of items in cache
    }),
  ],
  controllers: [ScraperController],
  providers: [ScraperService],
  exports: [ScraperService],
})
export class ScraperModule {}
