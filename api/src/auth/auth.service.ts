import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiException } from '../common/api.exception';
import { Clock } from '../common/clock';
import { logText } from '../common/log-text';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../users/password';
import { toTokenUser, toUserResource } from '../users/user';
import type { TokenUser, UserResource } from '../users/user';
import { UsersService } from '../users/users.service';
import type { LoginDto } from './dto/login.schema';
import { JWT_CONFIG } from './jwt-config';
import type { JwtConfig } from './jwt-config';
import type { JwtClaims } from './jwt-payload';
import type { TokenResponse } from './token';

/** Eine Meldung für falsches Passwort, unbekannten Namen und gesperrtes Konto (US09-2/-3, R21). */
export const INVALID_CREDENTIALS_MESSAGE = 'Benutzername oder Passwort ist falsch.';

export function invalidCredentials(): ApiException {
  return new ApiException(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);
}

/**
 * Anmeldung (03 B4.6, R21). Ablauf je Anfrage immer gleich teuer: Konto lesen, **ein** bcrypt-`compare`
 * (gegen den echten Hash oder, bei unbekanntem Namen, gegen `DUMMY_PASSWORD_HASH`), dann erst entscheiden.
 * So verrät die Antwortzeit nicht, ob es den Namen gibt (US09-3). Antworten entstehen nur über Mapper.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly clock: Clock,
    @Inject(JWT_CONFIG) private readonly config: JwtConfig,
  ) {}

  /**
   * Log-Ereignisse (C1 A09): Erfolg und Fehlschlag mit Benutzername (bereinigt, `logText`) und Grund, **nie** mit
   * Passwort oder Token; keine IP (C2: keine IPs im Anwendungslog). Der Grund steht nur im Log, die Antwort bleibt
   * für alle Fälle gleich (US09-2/-3).
   */
  async login(dto: LoginDto): Promise<TokenResponse> {
    const account = await this.users.findForLogin(dto.username);
    const matches = await verifyPassword(dto.password, account?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!account || !matches || !account.isActive) {
      const reason = !account ? 'unbekannter Benutzername' : !matches ? 'falsches Passwort' : 'Konto gesperrt';
      this.logger.warn(`Anmeldung fehlgeschlagen: Benutzer "${logText(dto.username)}" (${reason})`);
      throw invalidCredentials();
    }
    await this.users.recordLogin(account.id, this.clock.now());
    this.logger.log(`Anmeldung erfolgreich: Benutzer "${logText(account.username)}" (Konto ${account.id})`);
    return this.issueToken(toTokenUser(account));
  }

  /** Signiert ein Token (HS256, `iss`, `aud`, `exp` aus den Modul-Optionen) und baut die Antwort. */
  async issueToken(user: TokenUser): Promise<TokenResponse> {
    const claims: JwtClaims = { sub: user.id, username: user.username, roles: [...user.roles] };
    return {
      accessToken: await this.jwt.signAsync(claims),
      tokenType: 'Bearer',
      expiresIn: this.config.expiresInSeconds,
      user: { id: user.id, username: user.username, roles: [...user.roles] },
    };
  }

  /** `GET /api/auth/me`: das Konto zum Token; gibt es es nicht mehr oder ist es gesperrt → 401. */
  async me(sub: number): Promise<UserResource> {
    const account = await this.users.findById(sub);
    if (!account || !account.isActive) {
      throw new ApiException(401, 'UNAUTHENTICATED', 'Das Konto zum Token gibt es nicht mehr.');
    }
    return toUserResource(account);
  }
}
