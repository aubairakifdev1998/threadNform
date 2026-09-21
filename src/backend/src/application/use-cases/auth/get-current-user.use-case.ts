import { Inject, Injectable } from '@nestjs/common';
import {
  AUTH_REPOSITORY,
  type AuthRepository,
} from '../../../domain/repositories/auth.repository.js';

@Injectable()
export class GetCurrentUserUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
  ) {}

  execute(accessToken: string) {
    return this.authRepository.getUserFromToken(accessToken);
  }
}
