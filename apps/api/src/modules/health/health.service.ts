import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Vérifie que l'API répond ET que la base de données est joignable.
   * - Base joignable : { status: 'ok', time } (HTTP 200).
   * - Base injoignable : HTTP 503 sans aucun détail interne (ni message d'erreur, ni adresse, ni identifiant).
   */
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      // On journalise seulement le type d'erreur : le message peut contenir l'adresse de la base.
      this.logger.error(
        `Base de données injoignable (${error instanceof Error ? error.name : 'erreur inconnue'})`,
      );
      throw new ServiceUnavailableException({ status: 'error', message: 'Service indisponible' });
    }
    return { status: 'ok', time: new Date().toISOString() };
  }
}
