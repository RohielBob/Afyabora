import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@glyka/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';

export const FORBIDDEN_MESSAGE = 'Accès refusé : votre compte ne permet pas cette action.';

/**
 * Garde GLOBALE, exécutée APRÈS JwtAuthGuard : si la route porte @Roles(...), le rôle de l'utilisateur
 * (lu dans son jeton) doit faire partie de la liste ; sinon 403.
 *
 * Le rôle ne suffit pas : chaque service vérifie AUSSI que la donnée appartient à l'utilisateur
 * (ex. une mesure n'est modifiable que par son patient). Ce contrôle de propriété est fait dans chaque module.
 * Le test roles-contract.test.ts vérifie que chaque route porte les rôles indiqués dans le contrat d'API.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user = context.switchToHttp().getRequest().user as { role: UserRole } | undefined;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException({ message: FORBIDDEN_MESSAGE });
    }
    return true;
  }
}
