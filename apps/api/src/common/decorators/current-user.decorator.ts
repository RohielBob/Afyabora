import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@glyka/shared';

export interface AuthUser {
  id: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
