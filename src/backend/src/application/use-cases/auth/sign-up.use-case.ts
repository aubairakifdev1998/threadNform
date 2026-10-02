import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenException } from '../../../domain/exceptions/domain.exception.js';
import {
  AUTH_REPOSITORY,
  type AuthRepository,
  type SignUpInput,
} from '../../../domain/repositories/auth.repository.js';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from '../../../domain/repositories/customer.repository.js';
import {
  PLATFORM_SETTINGS_REPOSITORY,
  type PlatformSettingsRepository,
} from '../../../domain/repositories/platform-settings.repository.js';

@Injectable()
export class SignUpUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customers: CustomerRepository,
    @Inject(PLATFORM_SETTINGS_REPOSITORY)
    private readonly settings: PlatformSettingsRepository,
  ) {}

  async execute(input: SignUpInput) {
    const policy = await this.settings.getCommercePolicy();
    if (policy.blockNewRegistrations) {
      throw new ForbiddenException(
        'New account registration is currently closed.',
        'REGISTRATION_CLOSED',
      );
    }

    const result = await this.authRepository.signUp(input);

    if (result.status === 'authenticated') {
      await this.customers.ensureFromAuth({
        id: result.session.user.id,
        email: result.session.user.email,
        fullName: result.session.user.fullName,
      });
    }

    return result;
  }
}
