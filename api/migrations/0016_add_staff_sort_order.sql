-- スタッフの並び順を追加
ALTER TABLE staff_facilities ADD COLUMN sort_order INTEGER DEFAULT 0;
