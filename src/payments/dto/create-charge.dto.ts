import { IsIn, IsInt } from 'class-validator';

export const PACKAGES: Record<number, number> = {
  100: 29,
  500: 129,
  1000: 239,
  5000: 999,
};

export class CreateChargeDto {
  @IsInt()
  @IsIn(Object.keys(PACKAGES).map(Number), { message: `credits must be one of: ${Object.keys(PACKAGES).join(', ')}` })
  credits: number;
}
