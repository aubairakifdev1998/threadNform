import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ConflictException,
  DomainException,
  ForbiddenException,
  InsufficientStockException,
  InvalidTransitionException,
  NotFoundException,
  UnauthorizedException,
  ValidationException,
} from '../../domain/exceptions/domain.exception.js';
import { fail } from '../../domain/shared/api-response.js';

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof DomainException) {
      const status = this.mapDomainStatus(exception);
      response.status(status).json(
        fail(exception.code, exception.message, exception.details ?? {}),
      );
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        response.status(status).json(fail(HttpStatus[status] ?? 'HTTP_ERROR', exceptionResponse));
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
      response.status(status).json(fail(code, message, { ...(body.details as object) }));
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
      fail('INTERNAL_ERROR', 'Internal server error'),
    );
  }

  private mapDomainStatus(exception: DomainException): number {
    if (exception instanceof NotFoundException) return HttpStatus.NOT_FOUND;
    if (exception instanceof UnauthorizedException) return HttpStatus.UNAUTHORIZED;
    if (exception instanceof ForbiddenException) return HttpStatus.FORBIDDEN;
    if (exception instanceof InsufficientStockException) return HttpStatus.CONFLICT;
    if (exception instanceof InvalidTransitionException) return HttpStatus.CONFLICT;
    if (exception instanceof ConflictException) return HttpStatus.CONFLICT;
    if (exception instanceof ValidationException) return HttpStatus.BAD_REQUEST;
    return HttpStatus.BAD_REQUEST;
  }
}
