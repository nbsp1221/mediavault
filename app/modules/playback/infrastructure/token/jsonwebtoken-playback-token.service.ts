import { randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { getPlaybackConfig } from '~/shared/config/playback.server';
import type {
  PlaybackTokenIssueInput,
  PlaybackTokenPayload,
  PlaybackTokenService,
} from '../../application/ports/playback-token-service.port';

const PLAYBACK_TOKEN_TYPE = 'mediavault.playback';
const PLAYBACK_TOKEN_VERSION = 1;
const PLAYBACK_TOKEN_ALGORITHM = 'HS256';

interface JsonWebTokenPlaybackTokenServiceDependencies {
  config?: {
    jwtAudience: string;
    jwtExpiry: SignOptions['expiresIn'];
    jwtIssuer: string;
    jwtSecret: string;
  };
  createTokenId?: () => string;
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

  private readonly createTokenId: () => string;

  constructor(deps: JsonWebTokenPlaybackTokenServiceDependencies = {}) {
    this.config = deps.config ?? getPlaybackConfig();
    this.jwt = deps.jwt ?? {
      JsonWebTokenError: jwt.JsonWebTokenError,
      TokenExpiredError: jwt.TokenExpiredError,
      sign: jwt.sign,
      verify: jwt.verify,
    };
    this.createTokenId = deps.createTokenId ?? randomUUID;
  }

  async issue(input: PlaybackTokenIssueInput): Promise<string> {
    if (input.viewerType === 'anonymous' && input.subjectUserId) {
      throw new Error('Anonymous playback tokens must not include a subject user');
    }

    if (input.viewerType === 'anonymous' && input.readScope !== 'public_only') {
      throw new Error('Anonymous playback tokens must use public-only scope');
    }

    if (input.viewerType === 'authenticated' && !input.subjectUserId) {
      throw new Error('Authenticated playback tokens require a subject user');
    }

    return this.jwt.sign({
      ...(input.ipAddress ? { ip: input.ipAddress } : {}),
      ...(input.subjectUserId ? { sub: input.subjectUserId } : {}),
      ...(input.userAgent ? { userAgent: input.userAgent } : {}),
      readScope: input.readScope,
      typ: PLAYBACK_TOKEN_TYPE,
      ver: PLAYBACK_TOKEN_VERSION,
      videoId: input.videoId,
      viewerType: input.viewerType,
    }, this.config.jwtSecret, {
      algorithm: PLAYBACK_TOKEN_ALGORITHM,
      audience: this.config.jwtAudience,
      expiresIn: this.config.jwtExpiry,
      issuer: this.config.jwtIssuer,
      jwtid: this.createTokenId(),
      notBefore: 0,
    });
  }

  async validate(token: string): Promise<PlaybackTokenPayload | null> {
    try {
      const payload = this.jwt.verify(token, this.config.jwtSecret, {
        algorithms: [PLAYBACK_TOKEN_ALGORITHM],
        audience: this.config.jwtAudience,
        issuer: this.config.jwtIssuer,
      }) as {
        exp?: unknown;
        iat?: unknown;
        ip?: string;
        jti?: string;
        nbf?: unknown;
        readScope?: string;
        sub?: string;
        typ?: string;
        userAgent?: string;
        ver?: unknown;
        videoId?: unknown;
        viewerType?: string;
      };

      if (!isValidPlaybackTokenPayload(payload)) {
        return null;
      }

      if (payload.viewerType === 'anonymous') {
        return {
          ipAddress: payload.ip,
          jti: payload.jti,
          readScope: 'public_only',
          userAgent: payload.userAgent,
          videoId: payload.videoId,
          viewerType: 'anonymous',
        };
      }

      return {
        ipAddress: payload.ip,
        jti: payload.jti,
        readScope: 'public_or_owned',
        subjectUserId: payload.sub,
        userAgent: payload.userAgent,
        videoId: payload.videoId,
        viewerType: 'authenticated',
      };
    }
    catch {
      return null;
    }
  }
}

function isValidPlaybackTokenPayload(payload: {
  exp?: unknown;
  iat?: unknown;
  ip?: string;
  jti?: string;
  nbf?: unknown;
  readScope?: string;
  sub?: string;
  typ?: string;
  userAgent?: string;
  ver?: unknown;
  videoId?: unknown;
  viewerType?: string;
}): payload is {
  ip?: string;
  jti: string;
  readScope: 'public_only';
  sub?: never;
  typ: string;
  userAgent?: string;
  ver: number;
  videoId: string;
  viewerType: 'anonymous';
} | {
  ip?: string;
  jti: string;
  readScope: 'public_or_owned';
  sub: string;
  typ: string;
  userAgent?: string;
  ver: number;
  videoId: string;
  viewerType: 'authenticated';
} {
  if (
    typeof payload.exp !== 'number' ||
    typeof payload.iat !== 'number' ||
    typeof payload.nbf !== 'number' ||
    payload.typ !== PLAYBACK_TOKEN_TYPE ||
    payload.ver !== PLAYBACK_TOKEN_VERSION ||
    typeof payload.jti !== 'string' ||
    typeof payload.videoId !== 'string'
  ) {
    return false;
  }

  if (payload.viewerType === 'anonymous') {
    return payload.readScope === 'public_only' && typeof payload.sub === 'undefined';
  }

  if (payload.viewerType === 'authenticated') {
    return payload.readScope === 'public_or_owned' && typeof payload.sub === 'string';
  }

  return false;
}
