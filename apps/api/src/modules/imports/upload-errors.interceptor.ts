// Erreurs de RÉCEPTION du fichier (multer, en anglais : « File too large »…) ⇒ messages du projet, en
// français et au format habituel. Seuls les messages EXACTS de multer sont traduits : une erreur du
// service (ex. 413 « Trop de lignes ») passe telle quelle.
import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { IMPORT_MAX_FILE_BYTES } from '@glyka/shared';
import { type Observable, catchError, throwError } from 'rxjs';
import { invalidField } from '../../common/data/owned-records';

/** Message de multer quand le fichier dépasse la limite (`limits.fileSize`). */
const FILE_TOO_LARGE = 'File too large';
/** Autres refus de multer / busboy : formulaire mal formé (plusieurs fichiers, mauvais champ…). */
const MALFORMED_UPLOAD = new Set([
  'Too many parts',
  'Too many files',
  'Field name too long',
  'Field value too long',
  'Too many fields',
  'Unexpected field',
  'Field name missing',
  'Multipart: Boundary not found',
  'Multipart: Malformed part header',
  'Multipart: Unexpected end of form',
  'Multipart: Unexpected end of file',
]);

/** Erreur de réception ⇒ erreur au format du projet ; toute autre erreur est rendue telle quelle. */
export function translateUploadError(error: unknown): unknown {
  if (error instanceof PayloadTooLargeException && error.message === FILE_TOO_LARGE) {
    return new PayloadTooLargeException({
      message: `Fichier trop volumineux (maximum ${IMPORT_MAX_FILE_BYTES / 1024 / 1024} Mo).`,
    });
  }
  if (error instanceof BadRequestException && MALFORMED_UPLOAD.has(error.message)) {
    return invalidField('file', 'Envoyez un seul fichier .csv ou .xlsx, dans le champ « file ».');
  }
  return error;
}

/** À placer AVANT `FileInterceptor` dans `@UseInterceptors(...)` : il entoure la réception du fichier. */
@Injectable()
export class UploadErrorsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(catchError((error: unknown) => throwError(() => translateUploadError(error))));
  }
}
