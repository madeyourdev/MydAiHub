import { IsString, IsEmail, MinLength, IsOptional, IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @IsString()
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class LoginDto {
  @IsString()
  username: string;

  @IsString()
  password: string;
}

export class GoogleAuthDto {
  @IsString()
  credential: string;
}
