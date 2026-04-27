const STORAGE_KEY = 'pdf-anony.usageGuideSeen.v1';

type UsageGuideStorage = Pick<Storage, 'getItem' | 'setItem'>;

function getStorage(): UsageGuideStorage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasSeenUsageGuide(storage: UsageGuideStorage | null = getStorage()): boolean {
  if (!storage) return false;

  try {
    return storage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markUsageGuideSeen(storage: UsageGuideStorage | null = getStorage()): void {
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, 'true');
  } catch {
    // 일부 file:// 또는 프라이버시 모드에서는 localStorage 접근이 실패할 수 있다.
  }
}
