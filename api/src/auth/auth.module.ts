import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from '../common/common.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JWT_CONFIG, jwtConfigFromEnv, jwtModuleOptions } from './jwt-config';
import { LOGIN_THROTTLER } from './login-throttle';

/**
 * Anmeldung (03 B4.1, B4.6): Login, JWT und die globalen Guards. Importiert nur `UsersModule` (und die Uhr);
 * kein Fachmodul importiert das `AuthModule`, die Guards wirken über `APP_GUARD` für alle Routen.
 *
 * Reihenfolge der Guards (03 B4.3): Nest führt `APP_GUARD`s in der Reihenfolge der Registrierung aus, deshalb
 * stehen beide **hier** in dieser Reihenfolge: erst `ThrottlerGuard` (429, bevor bcrypt läuft), dann
 * `JwtAuthGuard` (401). Der `RolesGuard` folgt in Schritt 11 als dritter Eintrag.
 *
 * `JWT_SECRET`/`JWT_EXPIRES_IN` kommen übergangsweise aus `process.env` (Schritt 11: `EnvSchema`); `main.ts`
 * prüft sie vor dem Aufbau, damit der Start mit klarer Meldung abbricht.
 */
@Module({
  imports: [
    CommonModule,
    UsersModule,
    JwtModule.registerAsync({ useFactory: () => jwtModuleOptions(jwtConfigFromEnv()) }),
    ThrottlerModule.forRoot({ throttlers: [LOGIN_THROTTLER] }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: JWT_CONFIG, useFactory: () => jwtConfigFromEnv() },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
