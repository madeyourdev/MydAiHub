import { IsOptional, IsInt, Min, IsEnum, IsIn } from 'class-validator';
import { Role, UserStatus } from '@prisma/client';

export const AI_MODELS = [
  // Free tier (rate-limited, no cost)
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-27b-it:free',
  'google/gemma-3-12b-it:free',
  'qwen/qwen3-14b:free',
  'qwen/qwen3-8b:free',
  'deepseek/deepseek-v3-0324:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  // Paid (charged per token via OpenRouter)
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'anthropic/claude-3-5-haiku',
  'anthropic/claude-sonnet-4-5',
  'google/gemini-flash-1.5',
  'google/gemini-2.0-flash-001',
  'meta-llama/llama-3.3-70b-instruct',
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
