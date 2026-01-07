/**
 * ローディング・エラー状態コンポーネント
 *
 * @module public-view/LoadingState
 */

/**
 * ローディング表示
 *
 * データ読み込み中のスピナーとテキストを表示
 *
 * @returns ローディング表示のJSX
 */
export function LoadingState() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
        <p className="mt-4 text-gray-600">読み込み中...</p>
      </div>
    </div>
  );
}

/**
 * ErrorStateコンポーネントのProps
 */
interface ErrorStateProps {
  /** エラーメッセージ（nullの場合はデフォルトメッセージ） */
  error: string | null;
}

/**
 * エラー表示
 *
 * エラー発生時のメッセージを表示
 *
 * @param props - コンポーネントProps
 * @returns エラー表示のJSX
 */
export function ErrorState({ error }: ErrorStateProps) {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full text-center">
        <div className="text-red-500 text-5xl mb-4">!</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          アクセスできません
        </h1>
        <p className="text-gray-600">
          {error || 'このリンクは無効または期限切れです'}
        </p>
      </div>
    </div>
  );
}
