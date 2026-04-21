import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { CookieOptions } from 'express';
import * as bcrypt from 'bcrypt';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findOneByUsername(username);
    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const isMatch = await bcrypt.compare(pass, user.password);
    if (isMatch) {
      const { password, ...result } = user;
      return result;
    }
    throw new UnauthorizedException('Invalid credentials');
  }

  async login(user: any) {
    await this.usersService.updateLastLogin(user.id);
    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        credits: user.credits,
        lastLoginAt: new Date(),
      },
    };
  }

  async register(data: any) {
    const existingUser = await this.usersService.findOneByUsername(data.username);
    if (existingUser) {
      throw new BadRequestException('Username already exists');
    }

    const existingEmail = await this.usersService.findOneByEmail(data.email);
    if (existingEmail) {
      throw new BadRequestException('Email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(data.password, salt);

    const newUser = await this.usersService.create({
      ...data,
      password: hashedPassword,
    });

    const { password, ...result } = newUser;
    return result;
  }

  getCookieOptions(): CookieOptions {
    const days = parseInt(process.env.COOKIE_EXPIRES_DAYS || '1');
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: days * 24 * 60 * 60 * 1000,
    };
  }

  async googleLogin(credential: string) {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    }).catch(() => {
      throw new UnauthorizedException('Invalid Google credential');
    });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new UnauthorizedException('Unable to retrieve email from Google');
    }

    const baseUsername = payload.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
    const username = `${baseUsername}_${Math.random().toString(36).slice(2, 7)}`;

    const user = await this.usersService.findOrCreateByGoogle({
      googleId: payload.sub,
      email: payload.email,
      username,
    });

    return this.login(user);
  }
}
