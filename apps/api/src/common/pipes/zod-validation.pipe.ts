import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';

/**
 * Usage : @Body(new ZodValidationPipe(createMeasurementSchema)) body: CreateMeasurementInput
 * L'entrée du schéma peut différer de sa sortie (`unknown`) : un schéma qui TRANSFORME est accepté (ex.
 * `mapping` de l'import, reçu en texte JSON dans un formulaire multipart et rendu en objet).
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Données invalides',
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}
