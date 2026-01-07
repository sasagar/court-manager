export default async function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">
        Court Management System
      </h1>
      <p className="text-gray-600 mb-8">
        コート予約・リアルタイム稼働管理・スタッフシフト管理
      </p>
      <div className="flex gap-4">
        <a
          href="/login"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          ログイン
        </a>
        <a
          href="/setup"
          className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          初期セットアップ
        </a>
      </div>
    </main>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
