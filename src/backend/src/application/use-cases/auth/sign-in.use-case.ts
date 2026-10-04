import { Inject, Injectable } from '@nestjs/common';
import {
  AUTH_REPOSITORY,
  type AuthRepository,
  type SignInInput,
} from '../../../domain/repositories/auth.repository.js';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from '../../../domain/repositories/customer.repository.js';
import { ForbiddenException } from '../../../domain/exceptions/domain.exception.js';

@Injectable()
export class SignInUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customers: CustomerRepository,
  ) {}

  async execute(input: SignInInput) {
    const session = await this.authRepository.signIn(input);
    const customer = await this.customers.findByEmail(
      input.email.trim().toLowerCase(),
    );
    if (customer?.status === 'BLOCKED') {
      if (session.accessToken) {
        try {
          await this.authRepository.signOut(session.accessToken);
        } catch {
          // Best-effort revoke; still deny the login response.
        }
      }
      throw new ForbiddenException(
        'This account cannot sign in. Please contact support.',
        'ACCOUNT_BLOCKED',
      );
    }
    return session;
  }
}
