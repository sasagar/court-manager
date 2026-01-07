import type { SSEEventType } from '../types';

// 施設ごとのSSE接続を管理
// Cloudflare Workersでは各リクエストが独立しているため、
// Durable Objectsを使用しない限り、グローバルな状態は保持できない
// ここでは簡易的な実装として、単一インスタンス内での管理のみ行う

interface SSEClient {
  controller: ReadableStreamDefaultController;
  facilityId: string;
}

// インメモリの接続管理（単一インスタンス内のみ有効）
const clients = new Map<string, SSEClient>();

/**
 * SSEクライアントを登録
 */
export function registerClient(
  clientId: string,
  facilityId: string,
  controller: ReadableStreamDefaultController
) {
  clients.set(clientId, { controller, facilityId });
}

/**
 * SSEクライアントを解除
 */
export function unregisterClient(clientId: string) {
  clients.delete(clientId);
}

/**
 * 施設の全クライアントにイベントをブロードキャスト
 */
export function broadcastToFacility(
  facilityId: string,
  data: { type: SSEEventType | string; [key: string]: unknown }
) {
  const encoder = new TextEncoder();
  const message = `data: ${JSON.stringify(data)}\n\n`;
  const encodedMessage = encoder.encode(message);

  for (const [clientId, client] of clients) {
    if (client.facilityId === facilityId) {
      try {
        client.controller.enqueue(encodedMessage);
      } catch {
        // クライアントが切断されている場合は削除
        clients.delete(clientId);
      }
    }
  }
}

/**
 * 特定のクライアントにイベントを送信
 */
export function sendToClient(
  clientId: string,
  data: { type: SSEEventType | string; [key: string]: unknown }
) {
  const client = clients.get(clientId);
  if (!client) return;

  const encoder = new TextEncoder();
  const message = `data: ${JSON.stringify(data)}\n\n`;

  try {
    client.controller.enqueue(encoder.encode(message));
  } catch {
    clients.delete(clientId);
  }
}

/**
 * ハートビートを送信
 */
export function sendHeartbeat(clientId: string) {
  const client = clients.get(clientId);
  if (!client) return false;

  const encoder = new TextEncoder();
  const message = `: heartbeat\n\n`;

  try {
    client.controller.enqueue(encoder.encode(message));
    return true;
  } catch {
    clients.delete(clientId);
    return false;
  }
}

/**
 * 接続数を取得
 */
export function getClientCount(facilityId?: string): number {
  if (!facilityId) {
    return clients.size;
  }
  let count = 0;
  for (const client of clients.values()) {
    if (client.facilityId === facilityId) {
      count++;
    }
  }
  return count;
}
