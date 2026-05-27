import jwt, { type SignOptions } from 'jsonwebtoken';
import { getPlaybackConfig } from '~/shared/config/playback.server';
import type {
  PlaybackTokenIssueInput,
  PlaybackTokenPayload,
  PlaybackTokenService,
} from '../../application/ports/playback-token-service.port';

interface JsonWebTokenPlaybackTokenServiceDependencies {
  config?: {
    jwtAudience: string;
    jwtExpiry: SignOptions['expiresIn'];
    jwtIssuer: string;
    jwtSecret: string;
  };
  jwt?: {
    JsonWebTokenError: typeof jwt.JsonWebTokenError;
    TokenExpiredError: typeof jwt.TokenExpiredError;
    sign: typeof jwt.sign;
    verify: typeof jwt.verify;
  };
}

export class JsonWebTokenPlaybackTokenService implements PlaybackTokenService {
  private readonly config: {
    jwtAudience: string;
    jwtExpiry: SignOptions['expiresIn'];
    jwtIssuer: string;
    jwtSecret: string;
  };

  private readonly jwt: {
    JsonWebTokenError: typeof jwt.JsonWebTokenError;
    TokenExpiredError: typeof jwt.TokenExpiredError;
    sign: typeof jwt.sign;
    verify: typeof jwt.verify;
  };

  constructor(deps: JsonWebTokenPlaybackTokenServiceDependencies = {}) {
    this.config = deps.config ?? getPlaybackConfig();
    this.jwt = deps.jwt ?? {
      JsonWebTokenError: jwt.JsonWebTokenError,
      TokenExpiredError: jwt.TokenExpiredError,
      sign: jwt.sign,
      verify: jwt.verify,
    };
  }

  async issue(input: PlaybackTokenIssueInput): Promise<string> {
    return this.jwt.sign({
      ...(input.ipAddress ? { ip: input.ipAddress } : {}),
      ...(input.userAgent ? { userAgent: input.userAgent } : {}),
      userId: input.userId,
      videoId: input.videoId,
    }, this.config.jwtSecret, {
      audience: this.config.jwtAudience,
      expiresIn: this.config.jwtExpiry,
      issuer: this.config.jwtIssuer,
    });
  }

  async validate(token: string): Promise<PlaybackTokenPayload | null> {
    try {
      const payload = this.jwt.verify(token, this.config.jwtSecret, {
        audience: this.config.jwtAudience,
        issuer: this.config.jwtIssuer,
      }) as {
        ip?: string;
        userAgent?: string;
        userId?: string;
        videoId: string;
      };

      return {
        ipAddress: payload.ip,
        userAgent: payload.userAgent,
        userId: payload.userId,
        videoId: payload.videoId,
      };
    }
    catch {
      return null;
    }
  }
}
