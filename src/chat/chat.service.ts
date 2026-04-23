import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';
import type { Conversation } from '@prisma/client';

const CREDIT_COST = 1;
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const SYSTEM_PROMPT = 'You are a helpful AI assistant.';
const HISTORY_LIMIT = 20;

const client = new OpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
});

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  constructor(private prisma: PrismaService) {}

  async sendMessage(
    userId: string,
    message: string,
    model: string,
    conversationId?: string,
  ): Promise<{ reply: string; credits: number; conversationId: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');
    if (user.credits < CREDIT_COST) throw new BadRequestException('Insufficient credits');

    // Get or create conversation
    let conversation: Conversation;
    if (conversationId) {
      const found = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
      if (!found) throw new NotFoundException('Conversation not found');
      if (found.userId !== userId) throw new ForbiddenException();
      conversation = found;
    } else {
      const title = message.length > 50 ? message.slice(0, 47) + '...' : message;
      conversation = await this.prisma.conversation.create({ data: { userId, title } });
    }

    // Load recent history for context
    const history = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: HISTORY_LIMIT,
      select: { role: true, content: true },
    });

    // Call Groq — user.aiModel is admin's default; frontend model overrides per-session
    const resolvedModel = model || user.aiModel || DEFAULT_MODEL;
    let reply: string;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    try {
      const response = await client.chat.completions.create({
        model: resolvedModel,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user', content: message },
        ],
      });
      reply = response.choices[0].message.content ?? '';
      inputTokens = response.usage?.prompt_tokens;
      outputTokens = response.usage?.completion_tokens;
    } catch {
      throw new InternalServerErrorException('Failed to get response from AI');
    }

    // Save messages + deduct credits atomically
    const [,,, updatedUser] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId: conversation.id, role: 'user', content: message, model: resolvedModel },
      }),
      this.prisma.message.create({
        data: { conversationId: conversation.id, role: 'assistant', content: reply, model: resolvedModel, inputTokens, outputTokens },
      }),
      this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { credits: { decrement: CREDIT_COST } },
        select: { credits: true },
      }),
    ]);

    return { reply, credits: updatedUser.credits, conversationId: conversation.id };
  }

  async getConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, role: true },
        },
      },
    });
  }

  async getMessages(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.userId !== userId) throw new ForbiddenException();

    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, model: true, createdAt: true },
    });
  }

  async deleteConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.userId !== userId) throw new ForbiddenException();

    await this.prisma.conversation.delete({ where: { id: conversationId } });
    return { message: 'Conversation deleted' };
  }

  // Runs every day at 02:00 — deletes conversations inactive for more than 7 days
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleExpiredConversations() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const { count } = await this.prisma.conversation.deleteMany({
      where: { updatedAt: { lt: cutoff } },
    });
    if (count > 0) this.logger.log(`Deleted ${count} conversations inactive > 7 days`);
  }
}
