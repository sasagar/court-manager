-- オプション設定の拡張とセッションメモ機能

-- plan_optionsに選択設定を追加
ALTER TABLE plan_options ADD COLUMN is_required INTEGER DEFAULT 0;  -- 必須選択かどうか
ALTER TABLE plan_options ADD COLUMN allow_multiple INTEGER DEFAULT 1;  -- 複数選択可能か
ALTER TABLE plan_options ADD COLUMN selection_type TEXT DEFAULT 'quantity';  -- 'quantity'(数量入力), 'checkbox'(チェックのみ), 'radio'(単一選択グループ)
ALTER TABLE plan_options ADD COLUMN option_group TEXT;  -- ラジオボタングループ名（同じグループ内で1つだけ選択）

-- セッションにメモ機能を追加
ALTER TABLE court_sessions ADD COLUMN memo TEXT;
