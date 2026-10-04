import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO(L4-01 à L4-04, L4-08) : logique métier de ce module (voir README.md).
}
