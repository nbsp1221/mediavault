/** Checks the current account session behind an authenticated playback grant. */
export interface PlaybackSessionValidator {
  isSessionActive(input: { sessionId: string; userId: string }): Promise<boolean>;
}
