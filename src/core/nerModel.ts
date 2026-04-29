/**
 * NER 모델 메타데이터 — config.json 의 sha256 해시를 모델 ID 로 사용해 OPFS 캐시
 * 디렉토리와 1:1 매핑한다. 메타 자체는 localStorage 에 저장 (가벼움 + 동기 read).
 *
 * OPFS 디렉토리 복사·저장 로직은 hook (`useNerModel`) 안에서. 본 모듈은 hash 계산과
 * 메타 직렬화에만 집중한다.
 */

export interface ModelMeta {
  /** sha256 hash of config.json bytes */
  id: string;
  modelName: string;
  loadedAt: number;
  labelMap: Record<number, string>;
}

export async function computeModelHash(configBytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', configBytes as BufferSource);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const NER_MODEL_META_KEY = 'ner.model.meta.v1';

export function readModelMeta(): ModelMeta | null {
  try {
    const raw = localStorage.getItem(NER_MODEL_META_KEY);
    return raw ? (JSON.parse(raw) as ModelMeta) : null;
  } catch {
    return null;
  }
}

export function writeModelMeta(meta: ModelMeta): void {
  localStorage.setItem(NER_MODEL_META_KEY, JSON.stringify(meta));
}
