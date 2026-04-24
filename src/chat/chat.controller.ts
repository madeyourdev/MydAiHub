import { Controller, Post, Get, Delete, Body, Param, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Post('message')
  async sendMessage(@Request() req: any, @Body() dto: SendMessageDto) {
    if (!dto.message?.trim()) throw new BadRequestException('Message cannot be empty');
    return this.chatService.sendMessage(
      req.user.userId,
      dto.message.trim(),
      dto.model,
      dto.conversationId,
    );
  }

  @Get('conversations')
  getConversations(@Request() req: any) {
    return this.chatService.getConversations(req.user.userId);
  }

  @Get('conversations/:id/messages')
  getMessages(@Request() req: any, @Param('id') id: string) {
    return this.chatService.getMessages(req.user.userId, id);
  }

  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Delete('conversations/:id')
  deleteConversation(@Request() req: any, @Param('id') id: string) {
    return this.chatService.deleteConversation(req.user.userId, id);
  }
}
