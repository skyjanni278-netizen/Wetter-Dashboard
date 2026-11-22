import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../users/user';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/** Angemeldeter Benutzer aus dem Token (`request.user`, gesetzt vom `JwtAuthGuard`); nur an geschützten Routen. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
  if (!user) throw new Error('CurrentUser an einer Route ohne JwtAuthGuard (@Public?)');
  return user;
});
