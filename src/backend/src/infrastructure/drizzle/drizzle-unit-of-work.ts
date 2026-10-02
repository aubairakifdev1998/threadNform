import { AsyncLocalStorage } from 'node:async_hooks';
import { Logger } from '@nestjs/common';
import type { UnitOfWork } from '../../domain/repositories/unit-of-work.js';
import type { DrizzleDB } from './drizzle.tokens.js';

type Executor = Omit<DrizzleDB, '$client'>;

const AFTER_COMMIT_BUDGET_MS = 8_000;
type Scope = { tx: Executor; effects: Array<() => Promise<void> | void> };

/**
 * Transaction scope shared by every repository. Repositories receive a proxy
 * (see `createScopedDb`) that resolves to the active transaction when one is
 * open on the current async call chain, and to the root pool otherwise.
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  private readonly logger = new Logger(DrizzleUnitOfWork.name);
  private readonly storage = new AsyncLocalStorage<Scope>();

  constructor(private readonly root: DrizzleDB) {}

  current(): Executor {
    return this.storage.getStore()?.tx ?? this.root;
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.storage.getStore()) {
      return work();
    }
    const effects: Scope['effects'] = [];
    const result = await this.root.transaction((tx) =>
      this.storage.run({ tx, effects }, work),
    );
    if (effects.length) await this.runEffects(effects);
    return result;
  }

  afterCommit(effect: () => Promise<void> | void): void {
    const scope = this.storage.getStore();
    if (scope) {
      scope.effects.push(effect);
    } else {
      void this.runEffects([effect]);
    }
  }

  /**
   * Runs post-commit effects before the request returns (serverless platforms
   * may freeze work left running after the response), bounded so a slow
   * mail server cannot hold the response for long. Effects must be
   * retry-safe: whatever does not finish is picked up again later (outbox).
   */
  private async runEffects(effects: Scope['effects']): Promise<void> {
    const all = Promise.allSettled(
      effects.map((effect) => Promise.resolve().then(effect)),
    ).then((results) => {
      for (const r of results) {
        if (r.status === 'rejected') {
          this.logger.error(
            'After-commit effect failed',
            r.reason instanceof Error ? r.reason.stack : String(r.reason),
          );
        }
      }
    });
    let timer: NodeJS.Timeout | undefined;
    const cap = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, AFTER_COMMIT_BUDGET_MS);
    });
    await Promise.race([all, cap]);
    clearTimeout(timer);
  }

  createScopedDb(): DrizzleDB {
    return new Proxy(this.root, {
      get: (_target, prop) => {
        const executor = this.current() as Record<PropertyKey, unknown>;
        const value = Reflect.get(executor, prop, executor);
        return typeof value === 'function' ? value.bind(executor) : value;
      },
    });
  }
}
