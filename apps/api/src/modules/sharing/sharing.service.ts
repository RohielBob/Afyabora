import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SharingService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO(L5-01, L5-02, L5-04, L5-05, L5-14) : logique métier de ce module (voir README.md).
}
