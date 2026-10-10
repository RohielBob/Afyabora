import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { USER_ROLES, type UserRole } from '@glyka/shared';
import type { AuthUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/** Message unique (contrat : réponse Unauthorized) : on ne dit pas POURQUOI le jeton est refusé. */
export const UNAUTHORIZED_MESSAGE = "Jeton d'accès absent, invalide ou expiré.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Garde GLOBALE (déclarée dans app.module.ts) : toute route exige un jeton d'accès valide, sauf @Public().
 * Sécurité par défaut : une route oubliée est protégée, pas ouverte.
 *
 * Vérifications (ticket L1-04) :
 *  1. en-tête « Authorization: Bearer <jeton> » présent ;
 *  2. signature HS256 avec notre secret, et expiration (15 min) ; l'algorithme est imposé, ce qui empêche
 *     un jeton forgé avec « alg: none » ou un autre algorithme d'être accepté ;
 *  3. contenu attendu : « sub » = UUID d'utilisateur, « role » = PATIENT | DOCTOR | ADMIN.
 * Ensuite, request.user = { id, role } est lu par @CurrentUser() et par RolesGuard.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header: unknown = request.headers?.authorization;
    const token =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw unauthorized();

    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(token, { algorithms: ['HS256'] });
    } catch {
      throw unauthorized(); // signature fausse, jeton expiré ou mal formé : même réponse
    }

    const user = toAuthUser(payload);
    if (!user) throw unauthorized();
    request.user = user;
    return true;
  }
}

/** Accepte seulement un contenu de la forme { sub: UUID, role: rôle connu } ; sinon null. */
function toAuthUser(payload: unknown): AuthUser | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { sub, role } = payload as { sub?: unknown; role?: unknown };
  if (typeof sub !== 'string' || !UUID.test(sub)) return null;
  if (typeof role !== 'string' || !(USER_ROLES as readonly string[]).includes(role)) return null;
  return { id: sub, role: role as UserRole };
}

function unauthorized(): UnauthorizedException {
  return new UnauthorizedException({ message: UNAUTHORIZED_MESSAGE });
}
