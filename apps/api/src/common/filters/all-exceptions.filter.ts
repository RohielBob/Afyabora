import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

/** Réponses d'erreur homogènes. Ne jamais renvoyer de détail interne ni de donnée de santé. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      // Une erreur qui précise un délai (ex. ACCOUNT_LOCKED) le donne aussi dans l'en-tête standard Retry-After.
      if (typeof body === 'object' && body !== null && 'retryAfterSeconds' in body) {
        const seconds = (body as { retryAfterSeconds?: unknown }).retryAfterSeconds;
        if (typeof seconds === 'number') res.setHeader('Retry-After', String(seconds));
      }
      return res.status(status).json(typeof body === 'string' ? { message: body } : body);
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: 'Erreur interne. Réessayez plus tard.' });
  }
}
