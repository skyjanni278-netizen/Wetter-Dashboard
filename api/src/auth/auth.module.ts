import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from '../common/common.module';
import type { AppConfig } from '../config/config';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JWT_CONFIG, jwtConfig, jwtModuleOptions } from './jwt-config';
import { RolesGuard } from './roles.guard';
import { AppThrottlerGuard, throttlerOptions } from './throttling';

/** `JWT_SECRET`/`JWT_EXPIRES_IN` aus dem globalen `ConfigModule` (geprüft mit `EnvSchema`, 03 B4.8). */
function jwtConfigFrom(config: AppConfig) {
  return jwtConfig(config.get('JWT_SECRET', { infer: true }), config.get('JWT_EXPIRES_IN', { infer: true }));
}

/**
 * Anmeldung (03 B4.1, B4.6): Login, JWT und die globalen Guards. Importiert nur `UsersModule` (und die Uhr);
 * kein Fachmodul importiert das `AuthModule`, die Guards wirken über `APP_GUARD` für alle Routen.
 *
 * Reihenfolge der Guards (03 B4.3): Nest führt `APP_GUARD`s in der Reihenfolge der Registrierung aus, deshalb
 * stehen alle drei **hier** in dieser Reihenfolge: erst `AppThrottlerGuard` (429, bevor bcrypt läuft), dann
 * `JwtAuthGuard` (401), dann `RolesGuard` (403; ohne `@Public()` und ohne `@Roles()` immer 403).
 *
 * Throttler (03 B4.8): globales Limit `THROTTLE_GLOBAL_LIMIT` je 60 s und IP für alle Routen, dazu `login`
 * (5 je 60 s nur am Login). Die Werte kommen aus dem `ConfigService`.
 */
@Module({
  imports: [
    CommonModule,
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfig) => jwtModuleOptions(jwtConfigFrom(config)),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfig) => throttlerOptions(config.get('THROTTLE_GLOBAL_LIMIT', { infer: true })),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: JWT_CONFIG, inject: [ConfigService], useFactory: (config: AppConfig) => jwtConfigFrom(config) },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
