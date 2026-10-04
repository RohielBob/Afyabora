import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DoctorService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO(L5-03, L5-11, L5-12) : logique métier de ce module (voir README.md).
}
