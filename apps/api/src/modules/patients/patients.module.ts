import { Module } from '@nestjs/common';
import { AccountService } from './account.service';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  controllers: [PatientsController],
  providers: [PatientsService, AccountService],
  exports: [PatientsService],
})
export class PatientsModule {}
