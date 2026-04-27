import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SummaryService } from '../summary/summary.service';
import { MemoryService } from '../memory/memory.service';
import OpenAI from 'openai';
import type { Conversation } from '@prisma/client';
import type { Response } from 'express';

const DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
const SYSTEM_PROMPT = 'You are a helpful AI assistant.';
const HISTORY_LIMIT = 20;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
    'X-Title': 'MydAIHub',
  },
});

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly userRateLimit = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private prisma: PrismaService,
    private summaryService: SummaryService,
    private memoryService: MemoryService,
  ) {}

  private checkRateLimit(userId: string): void {
    const now = Date.now();
    const entry = this.userRateLimit.get(userId);
    if (!entry || entry.resetAt <= now) {
      this.userRateLimit.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return;
    }
    if (entry.count >= RATE_LIMIT_MAX) {
      throw new HttpException(
        'Rate limit exceeded — maximum 20 messages per minute',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    entry.count++;
  }

  private async loadContext(conversationId: string, userId: string, message: string) {
    return Promise.all([
      this.prisma.message
        .findMany({
          where: { conversationId },
          orderBy: { createdAt: 'desc' },
          take: HISTORY_LIMIT,
          select: { role: true, content: true },
        })
        .then(msgs => msgs.reverse()),
      this.summaryService.searchRelevant(userId, message, 3),
      this.memoryService.getUserFacts(userId),
    ]);
  }

  private buildMessages(
    facts: string[],
    memories: string[],
    history: { role: string; content: string }[],
    message: string,
  ) {
    return [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...(facts.length
        ? [{ role: 'system' as const, content: `What you know about this user:\n${facts.join('\n')}` }]
        : []),
      ...(memories.length
        ? [{ role: 'system' as const, content: `Relevant context from past conversations:\n${memories.join('\n\n')}` }]
        : []),
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: message },
    ];
  }

  async sendMessage(
    userId: string,
    message: string,
    model: string | undefined,
    conversationId?: string,
  ): Promise<{ reply: string; credits: number; conversationId: string }> {
    this.checkRateLimit(userId);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');
    if (user.credits < 1) throw new BadRequestException('Insufficient credits');

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

    const [history, memories, facts] = await this.loadContext(conversation.id, userId, message);
    const resolvedModel = model || user.aiModel || DEFAULT_MODEL;

    let reply: string;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    try {
      const response = await client.chat.completions.create({
        model: resolvedModel,
        max_tokens: 1024,
        messages: this.buildMessages(facts, memories, history, message),
      });
      reply = response.choices[0].message.content ?? '';
      inputTokens = response.usage?.prompt_tokens;
      outputTokens = response.usage?.completion_tokens;
    } catch (err: any) {
      this.logger.error('OpenRouter API error', err?.message);
      const status = err?.status ?? err?.response?.status;
      if (status === 429)
        throw new BadRequestException(
          `Model "${resolvedModel}" rate limit exceeded — please try again later or select a different model`,
        );
      throw new InternalServerErrorException('Failed to get response from AI');
    }

    const creditCost = Math.max(1, Math.ceil(((inputTokens ?? 0) + (outputTokens ?? 0)) / 1000));

    const [, , , updatedUser] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId: conversation.id, role: 'user', content: message, model: resolvedModel },
      }),
      this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: reply,
          model: resolvedModel,
          inputTokens,
          outputTokens,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { credits: { decrement: creditCost } },
        select: { credits: true },
      }),
    ]);

    this.summaryService.checkAndSummarize(conversation.id, userId, reply).catch(() => {});

    return { reply, credits: updatedUser.credits, conversationId: conversation.id };
  }

  async streamMessage(
    userId: string,
    message: string,
    model: string | undefined,
    conversationId: string | undefined,
    res: Response,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(400).json({ message: 'User not found' });
      return;
    }
    if (user.credits < 1) {
      res.status(400).json({ message: 'Insufficient credits' });
      return;
    }

    try {
      this.checkRateLimit(userId);
    } catch {
      res.status(429).json({ message: 'Rate limit exceeded — maximum 20 messages per minute' });
      return;
    }

    let conversation: Conversation;
    if (conversationId) {
      const found = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
      if (!found) {
        res.status(404).json({ message: 'Conversation not found' });
        return;
      }
      if (found.userId !== userId) {
        res.status(403).json({ message: 'Forbidden' });
        return;
      }
      conversation = found;
    } else {
      const title = message.length > 50 ? message.slice(0, 47) + '...' : message;
      conversation = await this.prisma.conversation.create({ data: { userId, title } });
    }

    const [history, memories, facts] = await this.loadContext(conversation.id, userId, message);
    const resolvedModel = model || user.aiModel || DEFAULT_MODEL;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    let reply = '';
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    try {
      const stream = await client.chat.completions.create({
        model: resolvedModel,
        max_tokens: 1024,
        stream: true,
        stream_options: { include_usage: true },
        messages: this.buildMessages(facts, memories, history, message),
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          reply += content;
          sendEvent({ type: 'chunk', content });
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }
    } catch (err: any) {
      this.logger.error('OpenRouter streaming error', err?.message);
      sendEvent({ type: 'error', message: 'Failed to get response from AI' });
      res.end();
      return;
    }

    if (!reply) {
      sendEvent({ type: 'error', message: 'Empty response from AI' });
      res.end();
      return;
    }

    const creditCost = Math.max(1, Math.ceil(((inputTokens ?? 0) + (outputTokens ?? 0)) / 1000));

    const [, , , updatedUser] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId: conversation.id, role: 'user', content: message, model: resolvedModel },
      }),
      this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: reply,
          model: resolvedModel,
          inputTokens,
          outputTokens,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { credits: { decrement: creditCost } },
        select: { credits: true },
      }),
    ]);

    sendEvent({ type: 'done', credits: updatedUser.credits, conversationId: conversation.id });
    res.end();

    this.summaryService.checkAndSummarize(conversation.id, userId, reply).catch(() => {});
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
