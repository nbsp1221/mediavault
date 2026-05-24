import type { ActionFunctionArgs } from 'react-router';
import type {
  CommitStagedUploadToLibraryCommand,
  CommitStagedUploadToLibraryUseCaseResult,
} from '~/modules/ingest/application/use-cases/commit-staged-upload-to-library.usecase';
import { requireProtectedApiSessionValue } from '~/composition/server/auth';
import { getServerIngestServices } from '~/composition/server/ingest';

type UploadCommitRouteServices = {
  commitStagedUploadToLibrary: {
    execute(command: CommitStagedUploadToLibraryCommand): Promise<CommitStagedUploadToLibraryUseCaseResult>;
  };
};

type UploadCommitActionDependencies = {
  createErrorResponse: (error: unknown) => Response;
  getServerIngestServices: () => UploadCommitRouteServices;
  requireProtectedApiSessionValue: typeof requireProtectedApiSessionValue;
};

type UploadCommitFailureReason = Extract<
  CommitStagedUploadToLibraryUseCaseResult,
  { ok: false }
>['reason'];

function defaultCreateErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Unknown error occurred';
  const status = typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
    ? (error as { statusCode: number }).statusCode
    : 500;

  return new Response(message, { status });
}

function createUploadCommitCommand(
  body: Record<string, unknown>,
  ownerId: string,
  stagingId: string,
): CommitStagedUploadToLibraryCommand {
  const command: CommitStagedUploadToLibraryCommand = {
    genreSlugs: Array.isArray(body.genreSlugs)
      ? body.genreSlugs.filter(genreSlug => typeof genreSlug === 'string')
      : [],
    stagingId,
    tags: Array.isArray(body.tags)
      ? body.tags.filter(tag => typeof tag === 'string')
      : [],
    ownerId,
    title: typeof body.title === 'string' ? body.title : '',
  };

  if (typeof body.contentTypeSlug === 'string') {
    command.contentTypeSlug = body.contentTypeSlug;
  }

  if (typeof body.description === 'string') {
    command.description = body.description;
  }

  return command;
}

function getCommitFailureStatus(reason: UploadCommitFailureReason): number {
  switch (reason) {
    case 'COMMIT_STAGED_UPLOAD_REJECTED':
      return 400;
    case 'COMMIT_STAGED_UPLOAD_CONFLICT':
      return 409;
    case 'COMMIT_STAGED_UPLOAD_NOT_FOUND':
      return 404;
    case 'COMMIT_STAGED_UPLOAD_UNAVAILABLE':
      return 500;
  }
}

export function createUploadCommitAction(
  deps: UploadCommitActionDependencies,
) {
  return async function action({ params, request }: ActionFunctionArgs) {
    const authSession = await deps.requireProtectedApiSessionValue(request);
    if (authSession instanceof Response) return authSession;

    try {
      const stagingId = params.stagingId;
      if (!stagingId) {
        return Response.json({
          success: false,
          error: 'Staged upload id is required',
        }, { status: 400 });
      }

      const body = await request.json();
      const input = body && typeof body === 'object'
        ? body as Record<string, unknown>
        : {};
      const result = await deps.getServerIngestServices().commitStagedUploadToLibrary.execute(
        createUploadCommitCommand(input, authSession.userId, stagingId),
      );

      if (result.ok) {
        return Response.json({
          success: true,
          ...result.data,
        });
      }

      return Response.json({
        success: false,
        error: result.message,
      }, { status: getCommitFailureStatus(result.reason) });
    }
    catch (error) {
      return deps.createErrorResponse(error);
    }
  };
}

export const action = createUploadCommitAction({
  createErrorResponse: defaultCreateErrorResponse,
  getServerIngestServices,
  requireProtectedApiSessionValue,
});
