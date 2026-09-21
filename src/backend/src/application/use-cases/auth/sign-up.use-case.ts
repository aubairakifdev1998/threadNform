import { Inject, Injectable } from '@nestjs/common';
import {
  AUTH_REPOSITORY,
  type AuthRepository,
  type SignUpInput,
} from '../../../domain/repositories/auth.repository.js';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from '../../../domain/repositories/customer.repository.js';

@Injectable()
export class SignUpUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customers: CustomerRepository,
  ) {}

  async execute(input: SignUpInput) {
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
