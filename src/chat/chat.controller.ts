import { Controller, Post, Body, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsString, MinLength, IsOptional } from 'class-validator';

class SendMessageDto {
  @IsString()
  @MinLength(1)
  message: string;

  @IsOptional()
  @IsString()
  model?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post('message')
  async sendMessage(@Request() req: any, @Body() dto: SendMessageDto) {
    if (!dto.message?.trim()) throw new BadRequestException('Message cannot be empty');
    return this.chatService.sendMessage(req.user.userId, dto.message.trim(), dto.model || 'claude-sonnet-4-6');
  }
}
