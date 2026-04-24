import { IsOptional, IsInt, Min, IsEnum, IsIn } from 'class-validator';
import { Role, UserStatus } from '@prisma/client';

export const AI_MODELS = [
  // Free tier (rate-limited, no cost)
  'meta-llama/llama-3.3-70b-instruct:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'google/gemma-2-9b-it:free',
  'mistralai/mistral-7b-instruct:free',
  // Paid (charged per token via OpenRouter)
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'anthropic/claude-3-5-haiku',
  'anthropic/claude-3-5-sonnet',
  'google/gemini-flash-1.5',
  'google/gemini-pro-1.5',
  'meta-llama/llama-3.3-70b-instruct',
  'mistralai/mixtral-8x7b-instruct',
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
