export interface PlayerVideo {
  createdAt: Date;
  description?: string;
  duration: number;
  id: string;
  tags: string[];
  thumbnailUrl?: string;
  title: string;
  videoUrl: string;
}
