import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Routes à implémenter (voir README.md du module) :
  // TODO(L1-01 à L1-04) POST /auth/register : inscription patient (consentement obligatoire)
  // TODO(L1-01 à L1-04) POST /auth/register-doctor : inscription médecin (statut « en attente »)
  // TODO(L1-01 à L1-04) POST /auth/verify-email · POST /auth/login · POST /auth/refresh · POST /auth/logout
  // TODO(L1-01 à L1-04) POST /auth/forgot-password · POST /auth/reset-password
}
