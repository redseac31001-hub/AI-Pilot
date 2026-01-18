export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (a === null || b === null) {
    return false;
  }

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) {
      return false;
    }
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  if (typeof a === 'object') {
    if (Array.isArray(b)) {
      return false;
    }
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    const keysA = Object.keys(objA).sort();
    const keysB = Object.keys(objB).sort();
    if (keysA.length !== keysB.length) {
      return false;
    }
    for (let i = 0; i < keysA.length; i += 1) {
      if (keysA[i] !== keysB[i]) {
        return false;
      }
      const key = keysA[i];
      if (!deepEqual(objA[key], objB[key])) {
        return false;
      }
    }
    return true;
  }

  return false;
}
