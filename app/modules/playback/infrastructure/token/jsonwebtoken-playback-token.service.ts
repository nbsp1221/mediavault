import { randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { getPlaybackConfig } from '~/shared/config/app-config.server';
import type {
  PlaybackTokenIssueInput,
  PlaybackTokenPayload,
  PlaybackTokenService,
} from '../../application/ports/playback-token-service.port';

const PLAYBACK_TOKEN_TYPE = 'mediavault.playback';
const PLAYBACK_TOKEN_VERSION = 2;
const PLAYBACK_TOKEN_ALGORITHM = 'HS256';
const nonblankClaim = z.string().refine((value) => value.trim().length > 0);
const grantSchema = z.discriminatedUnion('viewerType', [
  z.object({
    viewerType: z.literal('anonymous'),
    readScope: z.literal('public_only'),
    sub: z.never().optional(),
    sid: z.never().optional(),
  }),
  z.object({
    viewerType: z.literal('authenticated'),
    readScope: z.literal('public_or_owned'),
    sub: nonblankClaim,
    sid: nonblankClaim,
  }),
]);
const tokenSchema = z.intersection(
  grantSchema,
  z.object({
    exp: z.number().finite(),
    iat: z.number().finite(),
    nbf: z.number().finite(),
    ip: z.string().optional(),
    userAgent: z.string().optional(),
    jti: nonblankClaim,
    videoId: nonblankClaim,
    typ: z.literal(PLAYBACK_TOKEN_TYPE),
    ver: z.literal(PLAYBACK_TOKEN_VERSION),
  }),
);

type PlaybackTokenConfig = {
  jwtAudience: string;
  jwtExpiry: SignOptions['expiresIn'];
  jwtIssuer: string;
  jwtSecret: string;
};

interface JsonWebTokenPlaybackTokenServiceDependencies {
  config?: PlaybackTokenConfig;
  createTokenId?: () => string;
  jwt?: Pick<typeof jwt, 'JsonWebTokenError' | 'TokenExpiredError' | 'sign' | 'verify'>;
}

export class JsonWebTokenPlaybackTokenService implements PlaybackTokenService {
  private readonly config: PlaybackTokenConfig;
  private readonly jwt: Pick<
    typeof jwt,
    'JsonWebTokenError' | 'TokenExpiredError' | 'sign' | 'verify'
  >;
  private readonly createTokenId: () => string;

  constructor(deps: JsonWebTokenPlaybackTokenServiceDependencies = {}) {
    this.config = deps.config ?? getPlaybackConfig();
    this.jwt = deps.jwt ?? jwt;
    this.createTokenId = deps.createTokenId ?? randomUUID;
  }

  async issue(input: PlaybackTokenIssueInput): Promise<string> {
    const grant = grantSchema.parse({
      readScope: input.readScope,
      sid: input.sessionId,
      sub: input.subjectUserId,
      viewerType: input.viewerType,
    });
    const payload = {
      ...grant,
      ...(input.ipAddress ? { ip: input.ipAddress } : {}),
      ...(input.userAgent ? { userAgent: input.userAgent } : {}),
      typ: PLAYBACK_TOKEN_TYPE,
      ver: PLAYBACK_TOKEN_VERSION,
      videoId: input.videoId,
    };
    return await new Promise<string>((resolve, reject) => {
      this.jwt.sign(
        payload,
        this.config.jwtSecret,
        {
          algorithm: PLAYBACK_TOKEN_ALGORITHM,
          audience: this.config.jwtAudience,
          expiresIn: this.config.jwtExpiry,
          issuer: this.config.jwtIssuer,
          jwtid: this.createTokenId(),
          notBefore: 0,
        },
        (error, token) => {
          if (error) {
            reject(error);
          } else if (!token) {
            reject(new Error('Playback token signing failed'));
          } else {
            resolve(token);
          }
        },
      );
    });
  }

  validate(token: string): Promise<PlaybackTokenPayload | null> {
    try {
      return Promise.resolve(
        readPayload(
          this.jwt.verify(token, this.config.jwtSecret, {
            algorithms: [PLAYBACK_TOKEN_ALGORITHM],
            audience: this.config.jwtAudience,
            issuer: this.config.jwtIssuer,
          }),
        ),
      );
    } catch {
      return Promise.resolve(null);
    }
  }
}

function readPayload(decoded: unknown): PlaybackTokenPayload | null {
  const parsed = tokenSchema.safeParse(decoded);
  if (!parsed.success) {
    return null;
  }
  const payload = parsed.data;
  const base = {
    ipAddress: payload.ip,
    jti: payload.jti,
    userAgent: payload.userAgent,
    videoId: payload.videoId,
  };
  return payload.viewerType === 'authenticated'
    ? {
        ...base,
        readScope: 'public_or_owned',
        sessionId: payload.sid,
        subjectUserId: payload.sub,
        viewerType: 'authenticated',
      }
    : { ...base, readScope: 'public_only', viewerType: 'anonymous' };
}
