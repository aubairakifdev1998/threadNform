import { Inject, Injectable } from '@nestjs/common';
import {
  AUTH_REPOSITORY,
  type AuthRepository,
  type SignInInput,
} from '../../../domain/repositories/auth.repository.js';

@Injectable()
export class SignInUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
  ) {}

  execute(input: SignInInput) {
    return this.authRepository.signIn(input);
  }
}
