import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DoctorDecisionMailJob } from './doctor-decision-mail.job';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TeamNotifier } from './team-notifier';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, PasswordService, TeamNotifier, DoctorDecisionMailJob],
  exports: [AuthService],
})
export class AuthModule {}
