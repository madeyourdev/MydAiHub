import { Controller, Get, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { MemoryService } from '../memory/memory.service';
import { AI_MODELS } from '../admin/dto/update-user.dto';

class UpdateMeDto {
  @IsIn(AI_MODELS, { message: `aiModel must be one of the supported models` })
  aiModel: string;
}

@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private memoryService: MemoryService,
  ) {}

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

  @UseGuards(JwtAuthGuard)
  @Get('me/memories')
  getMemories(@Request() req: any) {
    return this.memoryService.getMemoriesWithId(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/memories/:id')
  deleteMemory(@Request() req: any, @Param('id') id: string) {
    return this.memoryService.deleteFact(id, req.user.userId);
  }
}
