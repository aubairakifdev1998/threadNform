import { createHash } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TooManyRequestsException } from '../../../domain/exceptions/domain.exception.js';
import {
  RATE_LIMITER,
  type RateLimiter,
} from '../../../domain/repositories/rate-limiter.js';
import { RATE_LIMIT_KEY, type RateLimitRule } from './rate-limit.decorator.js';

/** Client IP as seen by the edge (Vercel sets these; first hop wins). */
export function clientIp(req: Request): string {
  const header = (name: string) => {
    const value = req.headers[name];
    return (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim();
  };
  return (
    header('x-vercel-forwarded-for') ||
    header('x-real-ip') ||
    header('x-forwarded-for') ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Applies @RateLimit rules. Fails open (logs) if the limiter store errors, so
 * an outage of the counter never takes checkout down with it.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rules = this.reflector.getAllAndOverride<RateLimitRule[]>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (
      !rules?.length ||
      this.config.get<boolean>('rateLimit.enabled') === false
    ) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    for (const rule of rules) {
      const subject = this.subject(req, rule);
      if (!subject) continue;
      let decision;
      try {
        decision = await this.limiter.hit(
          `${rule.name}:${subject}`,
          rule.windowSeconds,
          rule.max,
        );
      } catch (error) {
        this.logger.error(
          `Rate limiter unavailable for ${rule.name}`,
          error instanceof Error ? error.stack : String(error),
        );
        // Auth / lookup must fail closed; checkout/cart stay available.
        if (
          /^(sign-in|sign-up|forgot-password|oauth|order-lookup|order-view)/.test(
            rule.name,
          )
        ) {
          throw new TooManyRequestsException(60);
        }
        return true;
      }
      if (!decision.allowed) {
        throw new TooManyRequestsException(decision.retryAfterSeconds);
      }
    }
    return true;
  }

  private subject(req: Request, rule: RateLimitRule): string | null {
    if (!rule.by || rule.by === 'ip') return `ip:${clientIp(req)}`;
    const field = rule.by.slice('body:'.length);
    const value = (req.body as Record<string, unknown> | undefined)?.[field];
    if (typeof value !== 'string' || !value.trim()) return null;
    // Hash identifiers such as emails so the table holds no personal data.
    return `${field}:${createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 32)}`;
  }
}
