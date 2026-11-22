import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './role.entity';
import { UserRole } from './user-role.entity';
import { User } from './user.entity';
import { UsersService } from './users.service';

/**
 * Admin-Konten (03 B4.1): Tabellen `user`, `role`, `user_role`. Kein Controller, kein Endpunkt `/users`
 * (B2.1); Konten entstehen per CLI (`admin:create`) bzw. in der Dev-DB per `db:seed`. Exportiert den
 * `UsersService` für das `AuthModule`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, Role, UserRole])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
