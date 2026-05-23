export interface OwnedVideoCounterPort {
  countOwnedVideos(userId: string): Promise<number>;
}
