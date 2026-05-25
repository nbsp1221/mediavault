export type RequestViewer =
  | AnonymousViewer
  | AuthenticatedViewer;

export interface AnonymousViewer {
  type: 'anonymous';
}

export interface AuthenticatedViewer {
  type: 'authenticated';
  userId: string;
  username: string;
}

export const ANONYMOUS_VIEWER: AnonymousViewer = {
  type: 'anonymous',
};
