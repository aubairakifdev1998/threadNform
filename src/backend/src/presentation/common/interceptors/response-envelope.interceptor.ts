import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ok } from '../../../domain/shared/api-response.js';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const response = http.getResponse<{ statusCode?: number }>();

    return next.handle().pipe(
      map((data) => {
        if (response.statusCode === 204 || data === undefined) {
          return data;
        }
        if (data instanceof StreamableFile || Buffer.isBuffer(data)) {
          return data;
        }
        if (
          data &&
          typeof data === 'object' &&
          'success' in (data as Record<string, unknown>)
        ) {
          return data;
        }
        return ok(data);
      }),
    );
  }
}
