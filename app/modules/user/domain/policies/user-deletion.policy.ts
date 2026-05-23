export type UserDeletionDecision =
  | { allowed: true }
  | { allowed: false; reason: 'USER_OWNS_VIDEOS' };

interface UserDeletionPolicyInput {
  ownedVideoCount: number;
}

export class UserDeletionPolicy {
  static evaluate(input: UserDeletionPolicyInput): UserDeletionDecision {
    if (input.ownedVideoCount > 0) {
      return {
        allowed: false,
        reason: 'USER_OWNS_VIDEOS',
      };
    }

    return { allowed: true };
  }
}
