import type { VideoEntity } from '../../domain/entities/video.entity';

export interface VideoRepositoryPort {
  countByOwnerId(ownerId: string): Promise<number>;
  findVideoById(videoId: string): Promise<VideoEntity | null>;
}
