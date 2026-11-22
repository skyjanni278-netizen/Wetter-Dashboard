import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/public.decorator';
import { Roles } from '../common/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TokenResponseSchema, UserResourceSchema } from '../openapi/response.schemas';
import { ApiBearer, ApiErrors, ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { ADMIN_ROLE } from '../users/role.entity';
import type { AuthUser, UserResource } from '../users/user';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginSchema } from './dto/login.schema';
import type { LoginDto } from './dto/login.schema';
import { LoginThrottle } from './login-throttle';
import type { TokenResponse } from './token';

/** US09: Anmeldung des Admins (03 B3.1, B4.6). Es gibt keinen Registrierungsendpunkt. */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  /** Erzeugt ein Token (REST: Substantiv `tokens`), deshalb 200 statt 201 (B3.2): es wird nicht gespeichert. */
  @Post('tokens')
  @Public()
  @LoginThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anmelden: Token für den Admin (US09-1), 5 Versuche je Minute und IP' })
  @ApiZodBody(LoginSchema, 'Benutzername (getrimmt, klein) und Passwort (höchstens 72 Byte); keine weiteren Felder')
  @ApiZodResponse(200, TokenResponseSchema, 'Token (HS256, 1 h) und Benutzer, ohne Passwort-Hash')
  @ApiErrors({
    400: 'VALIDATION_FAILED: Feld fehlt, zu lang oder zusätzlich (`unrecognized_keys`, z. B. `roles`)',
    401: 'INVALID_CREDENTIALS: Benutzername oder Passwort falsch (gleiche Meldung für beides)',
    413: 'PAYLOAD_TOO_LARGE: Body über 64 KB',
    415: 'UNSUPPORTED_MEDIA_TYPE: Body nicht `application/json`',
    429: 'TOO_MANY_REQUESTS: mehr als 5 Versuche in 60 s von derselben IP',
  })
  createToken(@Body(new ZodValidationPipe(LoginSchema)) dto: LoginDto): Promise<TokenResponse> {
    return this.service.login(dto);
  }

  /** US09-8: das eigene Konto. `@Roles('admin')` wirkt ab Schritt 11 (RolesGuard); bis dahin reicht ein gültiges Token. */
  @Get('me')
  @Roles(ADMIN_ROLE)
  @ApiBearer()
  @ApiOperation({ summary: 'Angemeldetes Konto (US09-8)' })
  @ApiZodResponse(200, UserResourceSchema, 'Konto mit Rollen, ohne Passwort-Hash')
  @ApiErrors()
  me(@CurrentUser() user: AuthUser): Promise<UserResource> {
    return this.service.me(user.sub);
  }
}
