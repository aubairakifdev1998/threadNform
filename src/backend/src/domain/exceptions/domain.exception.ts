export class DomainException extends Error {
  constructor(
    message: string,
    public readonly code: string = 'DOMAIN_ERROR',
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'DomainException';
  }
}

export class NotFoundException extends DomainException {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with id "${id}" was not found` : `${resource} was not found`,
      'NOT_FOUND',
      id ? { resource, id } : { resource },
    );
    this.name = 'NotFoundException';
  }
}

export class UnauthorizedException extends DomainException {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedException';
  }
}

export class ForbiddenException extends DomainException {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN');
    this.name = 'ForbiddenException';
  }
}

export class ConflictException extends DomainException {
  constructor(message: string, code = 'CONFLICT', details: Record<string, unknown> = {}) {
    super(message, code, details);
    this.name = 'ConflictException';
  }
}

export class ValidationException extends DomainException {
  constructor(
    message: string,
    code = 'VALIDATION_ERROR',
    details: Record<string, unknown> = {},
  ) {
    super(message, code, details);
    this.name = 'ValidationException';
  }
}

export class InsufficientStockException extends DomainException {
  constructor(available: number, requested: number, sku?: string) {
    super(
      sku
        ? `Only ${available} units are available for SKU ${sku}.`
        : `Only ${available} units are available.`,
      'INSUFFICIENT_STOCK',
      { available, requested, sku },
    );
    this.name = 'InsufficientStockException';
  }
}

export class InvalidTransitionException extends DomainException {
  constructor(message: string, code: string, details: Record<string, unknown> = {}) {
    super(message, code, details);
    this.name = 'InvalidTransitionException';
  }
}
