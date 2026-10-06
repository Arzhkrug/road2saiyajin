type TestBody = () => void | Promise<void>;

const registry: { name: string; body: TestBody }[] = [];

export function test(name: string, body: TestBody): void {
  registry.push({ name, body });
}

export function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${message} — attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`,
    );
  }
}

export function assertTrue(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export async function runAll(): Promise<void> {
  let failed = 0;
  for (const entry of registry) {
    try {
      await entry.body();
      console.log(`✓ ${entry.name}`);
    } catch (error) {
      failed += 1;
      console.log(`✗ ${entry.name}`);
      console.log(
        `  ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  console.log(`${registry.length - failed}/${registry.length} tests passés`);
  if (failed > 0) {
    throw new Error(`${failed} test(s) en échec`);
  }
}
