import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import {
  DictionaryResponse,
  Pronunciation,
  Definition,
  Verb,
} from './interfaces/dictionary.interface';

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private readonly httpClient: AxiosInstance;
  private readonly CACHE_TTL = 1000 * 60 * 30; // 30 minutes

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {
    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
  }

  /**
   * Lấy từ điển Cambridge
   */
  async getDictionary(word: string, language: string): Promise<DictionaryResponse> {
    const { url, nation } = this.buildUrl(word, language);
    const wikiUrl = `https://simple.wiktionary.org/wiki/${word}`;

    // Check cache
    const cacheKey = this.getCacheKey(url);
    const cached = await this.cacheManager.get<DictionaryResponse>(cacheKey);
    if (cached) {
      this.logger.log(`Cache hit for: ${word}`);
      return cached;
    }

    try {
      // Fetch dictionary và verbs song song
      const [dictionaryResponse, verbs] = await Promise.allSettled([
        this.httpClient.get(url),
        this.fetchVerbs(wikiUrl),
      ]);

      if (
        dictionaryResponse.status === 'rejected' ||
        dictionaryResponse.value.status !== 200
      ) {
        throw new HttpException('Word not found', HttpStatus.NOT_FOUND);
      }

      const html = dictionaryResponse.value.data;
      const result = this.parseDictionary(html, word);

      // Thêm verbs nếu có
      if (verbs.status === 'fulfilled') {
        result.verbs = verbs.value;
      }

      // Chuẩn hóa dữ liệu
      this.normalizeData(result);

      // Cache kết quả
      await this.cacheManager.set(cacheKey, result, this.CACHE_TTL);

      return result;
    } catch (error) {
      this.logger.error(`Error fetching dictionary: ${error.message}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to fetch dictionary',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Parse HTML từ Cambridge Dictionary
   */
  private parseDictionary(html: string, word: string): DictionaryResponse {
    const $ = cheerio.load(html);
    const siteUrl = 'https://dictionary.cambridge.org';

    // Lấy từ
    const wordText = $('.hw.dhw').first().text() || word;

    if (!wordText) {
      throw new HttpException('Word not found', HttpStatus.NOT_FOUND);
    }

    // Lấy part of speech (loại từ)
    const posElements = $('.pos.dpos');
    const pos = [...new Set(posElements.map((i, el) => $(el).text()).get())];

    // Lấy phát âm
    const pronunciation: Pronunciation[] = [];
    $('.pos-header.dpos-h').each((i, s) => {
      const posNode = $(s).find('.dpos-g').first();
      if (!posNode.length) return;

      const p = posNode.text();
      $(s)
        .find('.dpron-i')
        .each((j, node) => {
          const $node = $(node);
          const lang = $node.find('.region.dreg').text();
          const audioSrc = $node.find('audio source').attr('src');
          const pron = $node.find('.pron.dpron').text();

          if (audioSrc && pron) {
            pronunciation.push({
              pos: p,
              lang: lang,
              url: siteUrl + audioSrc,
              pron: pron,
            });
          }
        });
    });

    // Lấy định nghĩa và ví dụ
    const definition: Definition[] = $('.def-block.ddef_block')
      .map((index, element) => {
        const $element = $(element);
        const pos = $element
          .closest('.pr.entry-body__el')
          .find('.pos.dpos')
          .first()
          .text();
        const source = $element.closest('.pr.dictionary').attr('data-id');
        const text = $element.find('.def.ddef_d.db').text();
        const translation = $element
          .find('.def-body.ddef_b > span.trans.dtrans')
          .text();

        const example = $element
          .find('.def-body.ddef_b > .examp.dexamp')
          .map((i, ex) => {
            const $ex = $(ex);
            return {
              id: i,
              text: $ex.find('.eg.deg').text(),
              translation: $ex.find('.trans.dtrans').text(),
            };
          })
          .get();

        return {
          id: index,
          pos: pos,
          source: source,
          text: text,
          translation: translation,
          example: example,
        };
      })
      .get();

    return {
      word: wordText,
      pos: pos,
      verbs: [],
      pronunciation: pronunciation,
      definition: definition,
    };
  }

  /**
   * Fetch verbs từ Wiktionary
   */
  private async fetchVerbs(wikiUrl: string): Promise<Verb[]> {
    const cacheKey = this.getCacheKey(wikiUrl);
    const cached = await this.cacheManager.get<Verb[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.httpClient.get(wikiUrl);
      const $$ = cheerio.load(response.data);
      const verbs: Verb[] = [];

      $$('.inflection-table tr td').each((index, cell) => {
        const cellElement = $$(cell);
        const cellText = cellElement.text().trim();

        if (!cellText) return;

        const pElement = cellElement.find('p');
        if (pElement.length > 0) {
          const pText = pElement.text().trim();
          const parts = pText
            .split('\n')
            .map((p) => p.trim())
            .filter((p) => p);

          if (parts.length >= 2) {
            const type = parts[0];
            const text = parts[1];

            if (type && text) {
              verbs.push({ id: verbs.length, type, text });
            }
          } else {
            const htmlContent = pElement.html();
            if (htmlContent && htmlContent.includes('<br>')) {
              const htmlParts = htmlContent.split('<br>');
              if (htmlParts.length >= 2) {
                const type =
                  $$(htmlParts[0]).text().trim() ||
                  htmlParts[0].replace(/<[^>]*>/g, '').trim();
                const textPart = htmlParts[1];
                const text =
                  $$(textPart).text().trim() ||
                  textPart.replace(/<[^>]*>/g, '').trim();

                if (type && text) {
                  verbs.push({ id: verbs.length, type, text });
                }
              }
            }
          }
        }
      });

      await this.cacheManager.set(cacheKey, verbs, this.CACHE_TTL);
      return verbs;
    } catch (error) {
      this.logger.warn(`Failed to fetch verbs from ${wikiUrl}: ${error.message}`);
      return [];
    }
  }

  /**
   * Build URL từ word và language
   */
  private buildUrl(word: string, language: string): { url: string; nation: string } {
    let lang: string;
    let nation = 'us';

    switch (language) {
      case 'en':
        lang = 'english';
        break;
      case 'uk':
        lang = 'english';
        nation = 'uk';
        break;
      case 'en-tw':
        lang = 'english-chinese-traditional';
        break;
      case 'en-cn':
        lang = 'english-chinese-simplified';
        break;
      default:
        lang = 'english';
    }

    const url = `https://dictionary.cambridge.org/${nation}/dictionary/${lang}/${word}`;
    return { url, nation };
  }

  /**
   * Chuẩn hóa dữ liệu: loại bỏ trùng lặp, sắp xếp
   */
  private normalizeData(data: DictionaryResponse): void {
    // Loại bỏ trùng lặp trong pos và sắp xếp
    data.pos = [...new Set(data.pos)].sort();

    // Loại bỏ trùng lặp trong verbs
    const verbsMap = new Map<string, Verb>();
    data.verbs.forEach((verb) => {
      const key = `${verb.type}-${verb.text}`;
      if (!verbsMap.has(key)) {
        verbsMap.set(key, verb);
      }
    });
    data.verbs = Array.from(verbsMap.values()).sort((a, b) =>
      a.type.localeCompare(b.type),
    );

    // Loại bỏ trùng lặp trong pronunciation
    const pronMap = new Map<string, Pronunciation>();
    data.pronunciation.forEach((pron) => {
      const key = `${pron.pos}-${pron.lang}-${pron.pron}`;
      if (!pronMap.has(key)) {
        pronMap.set(key, pron);
      }
    });
    data.pronunciation = Array.from(pronMap.values());

    // Sắp xếp definitions theo pos
    data.definition.sort((a, b) => a.pos.localeCompare(b.pos));
  }

  /**
   * Generate cache key từ URL
   */
  private getCacheKey(url: string): string {
    return `cache_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;
  }
}
