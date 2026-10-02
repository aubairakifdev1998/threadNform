import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ConflictException,
  DomainException,
  ForbiddenException,
  InsufficientStockException,
  InvalidTransitionException,
  NotFoundException,
  TooManyRequestsException,
  UnauthorizedException,
  ValidationException,
} from '../../domain/exceptions/domain.exception.js';
import { fail } from '../../domain/shared/api-response.js';
import { findPgError } from '../../infrastructure/drizzle/pg-errors.js';

/** Postgres SQLSTATEs that are caused by client input rather than server faults. */
const PG_CLIENT_ERRORS: Record<
  string,
  { status: number; code: string; message: string }
> = {
  '22P02': {
    status: HttpStatus.BAD_REQUEST,
    code: 'VALIDATION_ERROR',
    message: 'One of the supplied identifiers or values is malformed',
  },
  '22003': {
    status: HttpStatus.BAD_REQUEST,
    code: 'VALIDATION_ERROR',
    message: 'A numeric value is out of range',
  },
  '22001': {
    status: HttpStatus.BAD_REQUEST,
    code: 'VALIDATION_ERROR',
    message: 'A text value is too long',
  },
  '23505': {
    status: HttpStatus.CONFLICT,
    code: 'DUPLICATE',
    message: 'A record with these details already exists',
  },
  '23503': {
    status: HttpStatus.CONFLICT,
    code: 'REFERENCE_CONFLICT',
    message:
      'This record is linked to other data, or refers to data that does not exist',
  },
  '23514': {
    status: HttpStatus.CONFLICT,
    code: 'CONSTRAINT_VIOLATION',
    message: 'The change violates a data rule',
  },
};

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof DomainException) {
      const status = this.mapDomainStatus(exception);
      if (exception instanceof TooManyRequestsException) {
        response.setHeader('Retry-After', String(exception.retryAfterSeconds));
      }
      response
        .status(status)
        .json(fail(exception.code, exception.message, exception.details ?? {}));
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        response
          .status(status)
          .json(fail(HttpStatus[status] ?? 'HTTP_ERROR', exceptionResponse));
        return;
      }
      const body = exceptionResponse as Record<string, unknown>;
      const message = Array.isArray(body.message)
        ? body.message.join(', ')
        : String(body.message ?? exception.message);
      const code =
        typeof body.error === 'string'
          ? body.error.toUpperCase().replace(/\s+/g, '_')
          : status === 400
            ? 'VALIDATION_ERROR'
            : 'HTTP_ERROR';
      response
        .status(status)
        .json(fail(code, message, { ...(body.details as object) }));
      return;
    }

    const pg = findPgError(exception);
    const mapped = pg ? PG_CLIENT_ERRORS[pg.code] : undefined;
    if (mapped) {
      this.logger.warn(
        `${request?.method} ${request?.url} → ${mapped.status} (pg ${pg!.code}${
          pg!.constraint ? ` ${pg!.constraint}` : ''
        }): ${pg!.message}`,
      );
      response.status(mapped.status).json(fail(mapped.code, mapped.message));
      return;
    }

    this.logger.error(
      `${request?.method} ${request?.url} → 500`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(fail('INTERNAL_ERROR', 'Something went wrong. Please try again.'));
  }

  private mapDomainStatus(exception: DomainException): number {
    if (exception instanceof TooManyRequestsException)
      return HttpStatus.TOO_MANY_REQUESTS;
    if (exception instanceof NotFoundException) return HttpStatus.NOT_FOUND;
    if (exception instanceof UnauthorizedException)
      return HttpStatus.UNAUTHORIZED;
    if (exception instanceof ForbiddenException) return HttpStatus.FORBIDDEN;
    if (exception instanceof InsufficientStockException)
      return HttpStatus.CONFLICT;
    if (exception instanceof InvalidTransitionException)
      return HttpStatus.CONFLICT;
    if (exception instanceof ConflictException) return HttpStatus.CONFLICT;
    if (exception instanceof ValidationException) return HttpStatus.BAD_REQUEST;
    return HttpStatus.BAD_REQUEST;
  }
}
