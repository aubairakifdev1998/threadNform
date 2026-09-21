import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { count } from 'drizzle-orm';
import {
  DRIZZLE,
  type DrizzleDB,
} from '../../infrastructure/drizzle/drizzle.tokens.js';
import { departments } from '../../infrastructure/drizzle/schema/index.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  @Get()
  check() {
    return {
      status: 'ok',
      service: 'fareya-backend',
      apiPrefix: 'api/v1',
      timestamp: new Date().toISOString(),
    };
  }

  /** Frontend / ops readiness: confirms DB schema is reachable. */
  @Get('ready')
  async ready() {
    try {
      const [row] = await this.db
        .select({ value: count() })
        .from(departments)
        .limit(1);

      return {
        status: 'ready',
        service: 'fareya-backend',
        database: 'ok',
        departmentsSample: Number(row?.value ?? 0) > 0 ? 1 : 0,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new ServiceUnavailableException({
        success: false,
        error: {
          code: 'NOT_READY',
          message: 'Database schema not ready. Run migrations.',
          details: {
            reason: error instanceof Error ? error.message : String(error),
          },
        },
      });
    }
  }
}
