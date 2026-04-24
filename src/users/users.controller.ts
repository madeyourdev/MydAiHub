import { Controller, Get, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { AI_MODELS } from '../admin/dto/update-user.dto';

class UpdateMeDto {
  @IsIn(AI_MODELS, { message: `aiModel must be one of the supported models` })
  aiModel: string;
}

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Request() req: any) {
    const user = await this.usersService.findById(req.user.userId);
    const { password, ...result } = user!;
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@Request() req: any, @Body() dto: UpdateMeDto) {
    return this.usersService.updateAiModel(req.user.userId, dto.aiModel);
  }
}
