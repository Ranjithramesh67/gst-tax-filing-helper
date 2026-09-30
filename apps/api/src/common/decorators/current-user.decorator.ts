import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Actor } from '../auth/actor.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: Actor }>();
    if (!request.user) throw new Error('CurrentUser used without an authenticated request');
    return request.user;
  },
);
