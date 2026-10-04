import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EmergencyService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO(L6-05, L6-06) : logique métier de ce module (voir README.md).
}
