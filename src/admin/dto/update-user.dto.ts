import { IsOptional, IsInt, Min, IsEnum, IsIn } from 'class-validator';
import { Role, UserStatus } from '@prisma/client';

export const AI_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'llama-3.1-8b-instant',
  'llama3-70b-8192',
  'llama3-8b-8192',
  'gemma2-9b-it',
  'gemma-7b-it',
  'mixtral-8x7b-32768',
];

export class UpdateUserDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  credits?: number;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsIn(AI_MODELS, { message: `aiModel must be one of: ${AI_MODELS.join(', ')}` })
  aiModel?: string;
}
