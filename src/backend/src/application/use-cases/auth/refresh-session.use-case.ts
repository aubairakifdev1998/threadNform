import { Inject, Injectable } from '@nestjs/common';
import {
  AUTH_REPOSITORY,
  type AuthRepository,
} from '../../../domain/repositories/auth.repository.js';

@Injectable()
export class RefreshSessionUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
  ) {}

  execute(refreshToken: string) {
    return this.authRepository.refreshSession(refreshToken);
  }
}
