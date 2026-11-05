/** Counts uploads and preparation jobs whose source still needs explicit cancellation. */
export interface ActiveUploadCounterPort {
  countActiveUploads(ownerId: string): Promise<number>;
}
