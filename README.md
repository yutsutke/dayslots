# コマ（仮）/ dayslots

1日を「時間帯の枡（ます）」で切って、やること・食事・運動を同じ骨組みで記録する iPhone アプリ。
ライフログ（`owntracks-supabase-notion`）の ◻️ やること と 🍽 食事 を持ち込み、種目を増やせる形にしたもの。

- 全体像・設計の正典 → **[SPEC.md](SPEC.md)**
- いまどこ・次に何をやるか → [TODO.md](TODO.md)／やったこと → [CHANGELOG.md](CHANGELOG.md)
- Claude 向けの決まり → [CLAUDE.md](CLAUDE.md)

## 動かす

```bash
npm install
npm run dev        # http://localhost:5276
npm test           # 枡の決まり・🔁 の展開・台帳の規則
npm run build      # dist/ を作る（Capacitor が包む中身）
```

iPhone 用の殻（Capacitor iOS）と Codemagic のビルドは Phase 1（[TODO.md](TODO.md)）。
