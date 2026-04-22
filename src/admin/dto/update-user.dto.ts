import { IsOptional, IsInt, Min, IsEnum, IsString } from 'class-validator';
import { Role, UserStatus } from '@prisma/client';

const AI_MODELS = ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7'];

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
  @IsString()
  aiModel?: string;

  validate() {
    if (this.aiModel && !AI_MODELS.includes(this.aiModel)) {
      throw new Error(`aiModel must be one of: ${AI_MODELS.join(', ')}`);
    }
  }
}
