import { getApiBaseUrl } from "@/config/env";

/**
 * Orval が生成するクライアントが利用する共通 fetch 実装（mutator）。
 * backend のベースURLを付与し、エラーとレスポンスの解釈を一元化する。
 * 生成物は `src/api/generated/` に出力される（手編集禁止）。
 */
export const customFetch = async <T>(url: string, options: RequestInit): Promise<T> => {
  const base = getApiBaseUrl();
  const response = await fetch(`${base}${url}`, options);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  // 204 No Content など本文が無い場合に配慮
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
};

export default customFetch;
