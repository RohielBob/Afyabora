import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO(L8-04, L8-05, L8-09) : logique métier de ce module (voir README.md).
}
