import type { VideoVisibility } from '../value-objects/video-visibility';
import { createVideoId } from '../value-objects/video-id';
import { createVideoTitle } from '../value-objects/video-title';
import { createVideoVisibility } from '../value-objects/video-visibility';

export interface CreateVideoEntityInput {
  contentTypeSlug?: string;
  createdAt: Date;
  description?: string;
  duration: number;
  genreSlugs?: string[];
  id: string;
  ownerId: string;
  tags: string[];
  thumbnailUrl?: string;
  title: string;
  videoUrl: string;
  visibility: unknown;
}

export type CreateVideoEntityResult =
  | { ok: true; video: VideoEntity }
  | {
    ok: false;
    reason:
      | 'VIDEO_ID_REQUIRED'
      | 'VIDEO_ID_UNSAFE'
      | 'VIDEO_OWNER_REQUIRED'
      | 'VIDEO_TITLE_REQUIRED'
      | 'VIDEO_VISIBILITY_INVALID';
  };

interface VideoEntityProps {
  contentTypeSlug?: string;
  createdAt: Date;
  description?: string;
  duration: number;
  genreSlugs: string[];
  id: string;
  ownerId: string;
  tags: string[];
  thumbnailUrl?: string;
  title: string;
  videoUrl: string;
  visibility: VideoVisibility;
}

export class VideoEntity {
  private constructor(private props: VideoEntityProps) {}

  static create(input: CreateVideoEntityInput): CreateVideoEntityResult {
    const videoId = createVideoId(input.id);
    if (!videoId.ok) {
      return videoId;
    }

    const ownerId = input.ownerId.trim();
    if (!ownerId) {
      return {
        ok: false,
        reason: 'VIDEO_OWNER_REQUIRED',
      };
    }

    const title = createVideoTitle(input.title);
    if (!title.ok) {
      return title;
    }

    const visibility = createVideoVisibility(input.visibility);
    if (!visibility.ok) {
      return visibility;
    }

    return {
      ok: true,
      video: new VideoEntity({
        contentTypeSlug: input.contentTypeSlug,
        createdAt: input.createdAt,
        description: input.description,
        duration: input.duration,
        genreSlugs: [...(input.genreSlugs ?? [])],
        id: videoId.videoId,
        ownerId,
        tags: [...input.tags],
        thumbnailUrl: input.thumbnailUrl,
        title: title.title,
        videoUrl: input.videoUrl,
        visibility: visibility.visibility,
      }),
    };
  }

  get id() {
    return this.props.id;
  }

  get contentTypeSlug() {
    return this.props.contentTypeSlug;
  }

  get description() {
    return this.props.description;
  }

  get genreSlugs() {
    return [...this.props.genreSlugs];
  }

  get ownerId() {
    return this.props.ownerId;
  }

  get tags() {
    return [...this.props.tags];
  }

  get title() {
    return this.props.title;
  }

  get visibility() {
    return this.props.visibility;
  }

  isOwnedBy(userId: string): boolean {
    return this.props.ownerId === userId;
  }

  makePublic() {
    this.props = {
      ...this.props,
      visibility: 'public',
    };
  }

  makePrivate() {
    this.props = {
      ...this.props,
      visibility: 'private',
    };
  }

  changeMetadata(input: {
    contentTypeSlug?: string;
    description?: string;
    genreSlugs?: string[];
    tags?: string[];
    title?: string;
  }): CreateVideoEntityResult {
    const title = typeof input.title === 'string'
      ? createVideoTitle(input.title)
      : null;

    if (title && !title.ok) {
      return title;
    }

    this.props = {
      ...this.props,
      contentTypeSlug: input.contentTypeSlug ?? this.props.contentTypeSlug,
      description: input.description ?? this.props.description,
      genreSlugs: input.genreSlugs ? [...input.genreSlugs] : this.props.genreSlugs,
      tags: input.tags ? [...input.tags] : this.props.tags,
      title: title?.title ?? this.props.title,
    };

    return {
      ok: true,
      video: this,
    };
  }
}
