'use client';

type AddReservationCardProps = {
  onClick: () => void;
};

/**
 * 予約追加用のカードコンポーネント
 * グリッドの最後に配置され、クリックで予約追加モーダルを開く
 */
export function AddReservationCard({ onClick }: AddReservationCardProps) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border-2 border-dashed border-gray-300 p-4 min-h-[120px] flex flex-col items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 hover:border-gray-400 transition-colors cursor-pointer"
    >
      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
        <svg
          className="w-6 h-6 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
      </div>
      <span className="text-sm text-gray-500 font-medium">予約を追加</span>
    </button>
  );
}
