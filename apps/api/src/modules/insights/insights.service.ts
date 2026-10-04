import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO(L3-03 à L3-07, L3-10) : logique métier de ce module (voir README.md).
}
