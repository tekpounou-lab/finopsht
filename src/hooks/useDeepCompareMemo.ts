import { useRef, useMemo } from 'react';

// Simple deep equality check for dependency arrays
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key) || !deepEqual(a[key], b[key])) return false;
  }
  return true;
}

export function useDeepCompareMemo<T>(factory: () => T, dependencies: React.DependencyList) {
  const dependenciesRef = useRef<React.DependencyList | undefined>(undefined);

  if (!deepEqual(dependenciesRef.current, dependencies)) {
    dependenciesRef.current = dependencies;
  }

  return useMemo(factory, dependenciesRef.current || []);
}
