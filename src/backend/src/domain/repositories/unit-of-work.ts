export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

/**
 * Runs a block of repository calls atomically. Nested calls join the
 * outer transaction. Any thrown error rolls everything back.
 */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
  /**
   * Defers a side effect (email, webhook) until the outermost transaction
   * commits; dropped on rollback. Outside a transaction it runs at once.
   */
  afterCommit(effect: () => Promise<void> | void): void;
}
