import type { LibraryVideo } from '../../domain/library-video';
import type { VideoReadAccessScope } from '../policies/video-read-access-scope';

export interface LibraryVideoReadPort {
  findLibraryVideoById(videoId: string, scope: VideoReadAccessScope): Promise<LibraryVideo | null>;
}
