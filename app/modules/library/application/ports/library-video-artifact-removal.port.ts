export interface CleanupLibraryVideoArtifactsResult {
  warning?: string;
}

export interface LibraryVideoArtifactRemovalPort {
  cleanupVideoArtifacts(input: {
    videoId: string;
  }): Promise<CleanupLibraryVideoArtifactsResult | void>;
}
