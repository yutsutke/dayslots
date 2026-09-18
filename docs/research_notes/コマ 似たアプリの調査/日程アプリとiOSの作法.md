# 日程アプリ（時間帯ブロック型プランナー）と iOS の作法 — コマの参考資料

調査日: 2026-09-18。Web 検索＋公式サイト・App Store・GitHub・Apple 開発者資料を直接読んだもの。価格は取得時点のもの（App Store の価格は国・時期で変わる）。
用語は初出でその行に説明を添える。

---

## Q1. 「1日を少数の粗いブロック（朝／昼／午後／夜）で見せる」アプリはどれか、使われ方はどうか

### Takeaway
1日を「朝・午後・夜」程度の粗い区切りで見せる設計は、専業の時間割アプリ（Structured / Sorted³ / TimeBloc / Sunsama / Motion など＝分単位の**タイムライン**が主流）には少なく、むしろ**ToDo・習慣系**（Apple リマインダーの「今日」、Things 3 の「今夜」、TickTick の習慣タブ、日本の たすくま の「セクション」）に見られる。ユーザーは「時刻を決めずに大まかな時間帯に置ける」ことを評価しつつ、「繰り返しがその区切りに入らない」「区切りの境界時刻を変えたい」という不満を出している。

### Cited Findings
**粗いブロック（時間帯バケツ）を持つもの**
- Apple リマインダー「今日」リスト＝**朝（Morning）／午後（Afternoon）／今夜（Tonight）の3区分**に自動で振り分け。境界は 朝=9:00・午後=15:00・今夜=18:00 固定で、区分の中で新規作成すると区分に合った時刻が自動で付く。時刻なしの項目は一番上にまとまる — [Apple Community: Default reminder times for 'Today' list sections](https://discussions.apple.com/thread/254770126)
- iOS 18 でこの「朝・午後・今夜」区分の**時刻をユーザーが変更できる**ようになった（それ以前は固定） — [Gadget Hacks: 11 Ways Apple's Reminders App Is Even Better with iOS 18](https://apple.gadgethacks.com/how-to/11-ways-apples-reminders-app-is-even-better-with-ios-18-ipados-18-and-macos-15-0385574/)
- Things 3「今夜（This Evening）」＝今日リストの中の任意の区切り。日付ピッカーに Today / This Evening / Someday の近道がある — [Cultured Code: Scheduling To-Dos](https://culturedcode.com/things/support/articles/2803579/)。日本語 App Store の説明では「夕方以降のプランのための特別な項目」 — [App Store JP: Things 3](https://apps.apple.com/jp/app/things-3/id904237743)
- Things 3 の不満＝**繰り返しタスクを「今夜」に入れる設定がない**ため毎日手で移す必要があり、ユーザーがショートカットで自動化している。「This Morning / This Afternoon」区切りも欲しいという要望がある — [Mike Burke: Automating 'This Evening' Repeating Tasks in Things 3](https://www.themikeburke.com/automating-this-evening-repeating-tasks-in-things-3/)
- TickTick の習慣（Habit）は **朝／午後／夜／その他** の区分に分けて表示され、自分でセクション（区分）を追加もできる — [TickTick Help: Better Achieve Habits](https://help.ticktick.com/articles/7055781805944733696)、[TickTick 公式 X 2021](https://x.com/ticktick/status/1431063693605834755?lang=en)
- たすくま（Taskuma、日本製、TaskChute 方式）＝「時間見積もり、**セクション**、終了時刻」を持ち、リピートタスクを自動生成、実行ログを残す。iOS 17 以降、Apple Watch 対応 — [App Store JP: Taskuma](https://apps.apple.com/jp/app/taskuma-taskchute-for-iphone/id896335635)。解説記事では「セクション＝1日を朝・午後・夜などの時間帯に分けて整理・分析する単位」 — [tosakablog: たすくま完全版](https://tosakablog.com/taskuma-matome/)
- 「Tick - Habit & Task Tracker」など、朝／日中／夜で習慣を並べる小さなアプリが 2025 年以降いくつも出ている — [App Store: Tick](https://apps.apple.com/ly/app/tick-habit-task-tracker/id6757186751)

**分単位タイムラインが主のもの（比較対象）**
- Structured＝**色分きブロックのタイムライン**。「1日全体を一目で」「ブロックをスライドして時刻調整」。終日タスク（時刻なし）も置ける — [Dave Swift: Structured Review](https://daveswift.com/structured/)、[Structured 公式](https://structured.app/)
- Sorted³＝タスク・予定・メモを1本の**時系列タイムライン**に並べる「ハイパースケジューリング」。オートスケジュール（自動で時刻を割り付け）と Time Ruler（指でなぞって時間を割り当てる定規）が特徴 — [Sorted³ 公式](https://www.sortedapp.com/)
- TimeBloc＝「1日を複数のイベントに区切る」ブロック型。ルーティン（＝毎日同じ並びの塊）を一度作ればタイムラインに自動で入る — [TimeBloc 公式](https://timebloc.app/)
- Tiimo＝色分きの**視覚タイムライン**、2025 年 App Store Awards「iPhone App of the Year」 — [Tiimo 公式](https://www.tiimoapp.com/)、[Daring Fireball 2025-12](https://daringfireball.net/2025/12/2025_app_store_award_winners)
- Routinery＝「決まった手順をタイマー付きで順に実行する」道具で、1日全体を並べる用途ではない。Tiimo と併用する人がいる — [Habi: Tiimo alternatives](https://habi.app/insights/tiimo-alternatives/)
- Sunsama＝1日を**朝の計画儀式**（15〜20 分）で組み、カレンダーにタイムボックス（＝時間の枡）として置く。AI 自動配置はしない — [Temporal 比較記事](https://temporal.day/blog/motion-vs-reclaim-vs-clockwise-vs-akiflow-vs-sunsama)
- Motion＝AI がタスクと会議を全自動で時刻配置（カレンダーを丸ごと置き換える発想）。Akiflow＝手で配置する速さ重視。Reclaim＝Google/Outlook の上に「守る時間」を足す層 — 同上 [Temporal](https://temporal.day/blog/motion-vs-reclaim-vs-clockwise-vs-akiflow-vs-sunsama)

### Inferences
- 「午前／昼／午後／夕方以降」の4枡は、Apple リマインダーの3区分＋Things の「今夜」＋TickTick 習慣の4区分と**ほぼ同じ粒度**で、iOS ユーザーに違和感が少ないと考えられる。
- 既存の不満（繰り返しが区分に入らない／境界時刻が固定）は、コマが最初から「繰り返しの規則に枡を含める」「枡の境界を設定で変えられる」ようにすれば解消できる差別化点。
- 分単位タイムライン系は「予定を細かく置く」人向け。コマの粗い枡は「時刻を決めたくない」層（Things・リマインダー利用者）と重なる。

### Gaps
- Amie・Notion Calendar・Morgen・Fantastical・Akiflow について「時間帯バケツ」の有無は公式資料で確認できなかった（いずれも時刻ベースのカレンダー UI が中心）。
- 「粗いブロック UI が好き／嫌い」の定量的なユーザー調査は見つからなかった（上記はレビュー・要望板からの断片）。

---

## Q2. 「予定（planned）と実績（actual）」をどう見せているか

### Takeaway
予定と実績を**両方の数値として並べて見せる**のは Sunsama（見積時間 vs 実績時間の日次カウンタ＋タイマー）と たすくま（TaskChute 方式の見積／実績）が代表。Structured は「予定ブロックを動かす」型で、実績時間を記録する機能は公式ヘルプ・レビューに見当たらなかった。

### Cited Findings
- Sunsama＝タスクに「planned time（見積）」と「actual time（実績）」の2つの時間を持つ。実績はタイマー（Space キー）か手入力（E キー）。日ごとの列の上に**実績 vs 見積**を切り替えて表示するカウンタがある。手入力しないまま完了した時は設定で「見積を実績として自動で計上」できる。カレンダー上の作業枠（working session）の長さを変えると見積が変わる — [Sunsama Manual: Planned and Actual Times](https://help.sunsama.com/docs/planned-and-actual-times)
- Sunsama の週次レビューは、完了タスク・チャネル（分類）別の使用時間・繰り返し先送りしたものを見せる — [Business Dive: Sunsama Review](https://thebusinessdive.com/sunsama-review)
- たすくま＝「時間見積もり、セクション、終了時刻」を持つ TaskChute 方式。実行ログを Evernote に保存、iOS カレンダーに**ログを出力**（＝実績をカレンダーへ書く）できる — [App Store JP: Taskuma](https://apps.apple.com/jp/app/taskuma-taskchute-for-iphone/id896335635)
- Structured＝タスクの所要時間の既定は 15 分でスライダーで変更。空き時間ができると「埋めましょう」と提案する — [Structured Help: Create, Edit & Delete Tasks](https://help.structured.app/en/articles/338050)、[Dave Swift](https://daveswift.com/structured/)
- 「TimeBoxer: Plan vs Actual Time」という、見積と実績の比較だけを売りにした単機能アプリが App Store にある — [App Store: TimeBoxer](https://apps.apple.com/app/id6720741072)
- Sunsama は Toggl（時間記録サービス）連携も持つ — [Sunsama: Toggl integration](https://www.sunsama.com/integrations/toggl)

### Inferences
- 実績の入れ方は「タイマー」「手入力」「見積を実績として自動採用」の3通りが定番。コマでも「実績未入力なら予定をそのまま実績にする」既定を用意すると入力の手間が減る。
- 実績を**カレンダーへ書き出す**（たすくま）と、予定を**カレンダーから読む**（Structured）は別方向。コマの「時刻付きの記録を Google カレンダーへ同期」は たすくま型に近い。

### Gaps
- Structured に実績時間の記録機能があるかは、公式ヘルプ・レビュー・要望板の検索では**確認できなかった**（見つからない＝無い可能性が高いが断定不可）。
- Rize・Timery（Toggl クライアント）と Sorted³ の連携については今回調べられなかった。

---

## Q3. 繰り返しの規則（平日／祝日／「第n営業日」「週の最終営業日」）と日本の祝日対応

### Takeaway
「第n営業日」「月末営業日」は Todoist・TickTick が自然文で受け付けるが、**営業日＝月〜金の固定**で祝日は除けない。日本の祝日を「繰り返しの除外条件」に組み込んだプランナーは見つからず、各アプリは Apple/Google の「日本の祝日」購読カレンダーを**表示するだけ**に留まる。

### Cited Findings
- Todoist の繰り返し語句＝「every weekday / every workday（月〜金）」「every first workday（月初の営業日）」「every last workday（月末の営業日）」「every 15th workday（第15営業日）」「every 3 workday（3営業日ごと）」。祝日語は new year day / valentine / halloween / new year eve のみ。**特定の祝日を飛ばす構文は無い**、営業日は月〜金固定 — [Todoist Help: Introduction to recurring dates](https://www.todoist.com/help/todoist/features/introduction-to-recurring-dates-YUYVJJAV)
- Todoist は「every day except ○○」の言い回しを認識しない — [Make: How to Skip Specific Days in Todoist](https://www.make.com/en/how-to-guides/todoist-schedule-every-day-except)
- TickTick＝「毎週月曜と木曜」「**月末営業日に1回**」など柔軟な繰り返しが設定できる。習慣は「平日だけ／休日だけ」が選べる — [Handle: TickTick 30個の使い方](https://allout-appreview.com/2025/06/14/ticktick-%E4%BD%BF%E3%81%84%E6%96%B9-ticktick/)、[Fika: iPad TickTick](https://fikaweb.jp/magazine/ipad-ticktick/)
- TickTick で祝日カレンダーを「Show in Calendar（カレンダーに表示のみ）」にすると、カレンダーには出るがタスク数に数えられない — [きまぐれモノログ: TickTick 設定](https://kimaguremono.hateblo.jp/entry/ticktick)
- Apple カレンダー（iOS 標準）には購読型の「日本の祝日」が組み込みで、カレンダー一覧でチェックすれば表示される。地域設定が日本以外だと出ない — [PC設定のカルマ](https://pc-karuma.net/iphone-ipad-app-calendar-show-hide-birthday-events/)、[ハウスケアラボ](https://lifestyle.assist-all.co.jp/iphone-calendar-holiday-settings-color-add-international/)
- 2026 年以降の祝日が iPhone カレンダーに出ないという報告があり、Apple 側の祝日データ更新待ちが原因とされる — [ハウスケアラボ](https://lifestyle.assist-all.co.jp/iphone-calendar-holiday-settings-color-add-international/)
- Sorted³＝「強力なリピートルール」を持ち、Apple カレンダー（標準）と統合 — [App Store JP: Sorted³](https://apps.apple.com/jp/app/sorted-%E3%82%AB%E3%83%AC%E3%83%B3%E3%83%80%E3%83%BC-%E3%83%8E%E3%83%BC%E3%83%88-%E3%82%B9%E3%82%AF/id1306893526)
- Structured＝Pro で「繰り返しタスクとルーティン」が作れる — [App Store JP: Structured](https://apps.apple.com/jp/app/structured-%E6%AF%8E%E6%97%A5%E3%81%AE%E4%BA%88%E5%AE%9A%E5%B8%B3/id1499198946)
- Things 3＝2025 年の更新で繰り返し ToDo を「早めに完了」「柔軟に日付変更」できるようになった — [App Store JP: Things 3](https://apps.apple.com/jp/app/things-3/id904237743)
- 「マルチタスク管理カレンダー」（日本製）は「作業を行わない日（休日）」を設定して作業時間を算出する — [App Store JP](https://apps.apple.com/jp/app/%E3%83%9E%E3%83%AB%E3%83%81%E3%82%B9%E3%82%AF%E7%AE%A1%E7%90%86%E3%82%AB%E3%83%AC%E3%83%B3%E3%83%80%E3%83%BC-%EF%BC%91%E6%97%A5%E3%81%AE%E4%BD%9C%E6%A5%AD%E6%99%82%E9%96%93%E3%81%8C%E3%82%8F%E3%81%8B%E3%82%8B/id1601175208)

### Inferences
- 「日本の祝日と振替休日を除いた営業日」「祝日の翌営業日にずらす」を繰り返しの規則に持てば、主要アプリに無い機能になる。祝日データは Apple/Google の購読カレンダーか内閣府 CSV を自前で持つ必要がある（内閣府 CSV の URL は今回未確認）。
- 「第n営業日」「最終営業日」の語彙は Todoist の英語構文が事実上の標準なので、コマの日本語 UI でも「第1営業日／最終営業日／n営業日ごと」の3種を最低限とすれば十分と考えられる。

### Gaps
- Sorted³・Structured・TimeBloc・Tiimo・Fantastical の「営業日」「第n営業日」対応の有無は公式資料で確認できなかった。
- 日本の祝日を繰り返しの**除外条件**として使えるプランナーは見つからなかった（探し方の限界かもしれない）。

---

## Q4. Google カレンダー同期のふるまい（一方向／双方向・終日の扱い）と価格・不満

### Takeaway
「タスクをカレンダーへ書き戻す（双方向）」のは Sunsama・Akiflow・Motion のような月額 $15〜20 級の Web サービス。Structured・Sorted³ など買い切り／低額のネイティブ系は **カレンダー→アプリの一方向読み込み**が主で、Structured は双方向を要望板で求められ続けている。

### Cited Findings
**同期方向**
- Structured＝Apple/Google/Outlook のカレンダーを**読み込み**（Pro 機能）、予定はタイムラインか終日タスクとして表示され、チェックも付けられる。**タスクを外部カレンダーへ書き出せない＝一方向のみ**。チームは双方向を「検討中」 — [Structured Help: Import External Calendars](https://help.structured.app/en/articles/329730)、[Structured Help: Can I Export My Tasks?](https://help.structured.app/en/articles/333506)、[要望板: Two-Way Calendar Sync](https://feedback.structured.app/p/two-way-calendar-sync)
- Sunsama＝Google カレンダーと**双方向**。Sunsama 側の変更は Google に、逆も同期。Todoist・Linear・Gmail・Slack の項目を1日の計画に集め、Google カレンダーにも載せる — [Sunsama: Google Calendar integration](https://www.sunsama.com/integrations/google-calendar)、[Efficient App: Sunsama](https://efficient.app/apps/sunsama)。ただし要望板には「Sunsama で作ったイベントを外部 Google カレンダーへ」といった積み残しもある — [Sunsama Roadmap](https://roadmap.sunsama.com/improvements/p/sync-sunsama-created-events-to-an-external-google-calendar)
- Sorted³＝iOS 標準の Apple カレンダーと統合（Google は iOS のカレンダーアカウント経由になる） — [App Store JP: Sorted³](https://apps.apple.com/jp/app/sorted-%E3%82%AB%E3%83%AC%E3%83%B3%E3%83%80%E3%83%BC-%E3%83%8E%E3%83%BC%E3%83%88-%E3%82%B9%E3%82%AF/id1306893526)。Zapier 経由の連携も案内されている — [Zapier: Google Calendar + Sorted](https://zapier.com/apps/google-calendar/integrations/sorted)
- TimeBloc＝Google カレンダーの既存イベントを計画に**取り込む** — [App Store: TimeBloc](https://apps.apple.com/us/app/timebloc-daily-planner/id1476033780)
- Tiimo＝日本語 App Store 説明では Apple カレンダーとリマインダーの同期を明記 — [App Store JP: Tiimo](https://apps.apple.com/jp/app/tiimo-%E3%83%86%E3%82%A3%E3%83%BC%E3%83%A2-%E3%82%B9%E3%82%B9%E3%82%AF%E7%AE%A1%E7%90%86%E3%82%92%E7%BF%92%E6%85%A3%E5%8C%96-adhd%E5%AF%BE%E7%AD%96-%E9%9B%86%E4%B8%AD/id1480220328)
- Motion＝「カレンダーを丸ごと置き換える」。Reclaim＝Google/Outlook の上に層を足す（置き換えない）、iCloud 非対応、モバイルアプリ無し。Akiflow＝手動でカレンダーへ置く — [Temporal 比較](https://temporal.day/blog/motion-vs-reclaim-vs-clockwise-vs-akiflow-vs-sunsama)

**価格（USD、2025-26）**
- Sunsama $16/月（年払い）・$20/月（月払い）、14 日試用 — [Upbase: Sunsama Review](https://upbase.io/blog/sunsama-review/)
- Akiflow $15/月（Temporal）〜$19/月・年払い（Business Dive） — [Temporal](https://temporal.day/blog/motion-vs-reclaim-vs-clockwise-vs-akiflow-vs-sunsama)、[Business Dive: Akiflow vs Sunsama](https://thebusinessdive.com/akiflow-vs-sunsama)
- Motion＝$19/月（年払い、Temporal）と **「約 $49/月」（Saner.AI）** で資料が食い違う（プラン改定と複数ティアのため） — [Temporal](https://temporal.day/blog/motion-vs-reclaim-vs-clockwise-vs-akiflow-vs-sunsama)、[Saner.AI: Motion Reviews](https://www.saner.ai/blogs/motion-reviews)
- Reclaim $8/月〜、無料プランあり、Dropbox 傘下 — [Temporal](https://temporal.day/blog/motion-vs-reclaim-vs-clockwise-vs-akiflow-vs-sunsama)
- Morgen $30/月（月払い）・$15/月（年払い）・「Believer」5年一括で $6.50/月相当 — [Millie Pham: Morgen Review](https://bymilliepham.com/morgen-calendar-review)
- Amie＝無料 Basic は 2024-09 で終了、2025 初頭に $6/月（年払い）の Personal を短期提供したが現在は Pro/Business のみ、最安は $20/月の AI ノートプラン — [nocal: Amie Alternatives](https://nocal.app/alternatives/amie)
- Fantastical＝Flexibits Premium 個人 $4.75/月（年払い）から、Free/Individual/Family/Team の4プラン — [Morgen: Fantastical pricing](https://www.morgen.so/blog-posts/fantastical-pricing)、[Flexibits pricing](https://flexibits.com/pricing?product=fantastical)
- TickTick Premium $35.99/年 — [2sync: TickTick vs Todoist](https://2sync.com/blog/ticktick-vs-todoist)
- Routinery Premium $3.99/月・$27.49/年（別資料では $7.99/月・$39.99/年）、台湾ストアに Lifetime NT$1,580 — [App Store: Routinery](https://apps.apple.com/us/app/routine-planner-habit-tracker/id1450486923)、[Habi: Routinery alternatives](https://habi.app/insights/routinery-alternatives/)
- TimeBloc＝年額 €17.99、Lifetime €22.99（スペインストア表示） — [App Store ES: TimeBloc](https://apps.apple.com/es/app/timebloc-daily-planner/id1476033780)
- Tiimo＝個人 $79.99/年、家族 $119.99/年（Lifestack）。要望板では「Lifetime は再導入しない」と明言 — [Lifestack: Tiimo Pricing](https://lifestack.ai/blog/tiimo-pricing)、[Tiimo Feedback: Lifetime](https://tiimo.nolt.io/127)

**不満（レビュー・掲示板から）**
- Motion＝オンボーディングが難しい、UI が散らかる、モバイル弱い、**値上げが複数回**、AI Employees 等への機能肥大で「基本ができないのに新規事業を追う」（Reddit 2026-01） — [Saner.AI](https://www.saner.ai/blogs/motion-reviews)、[Kai: Motion Review](https://hirekai.ai/blog/motion-app-review)
- Sunsama＝**価格が最頻の不満**（Product Hunt 21件中5件）、モバイルアプリが「値段に対して機能不足」で収集用途に留まる — [Upbase](https://upbase.io/blog/sunsama-review/)、[Productive with Chris](https://productivewithchris.com/app-reviews/sunsama-review-2025/)
- Akiflow＝毎日の手入れが必要、手動なのに高い。Reclaim＝モバイル無し。Sunsama＝1日 15〜20 分の儀式が負担 — [Temporal](https://temporal.day/blog/motion-vs-reclaim-vs-clockwise-vs-akiflow-vs-sunsama)
- Structured＝Windows/Web 版なし、共同作業なし — [Dave Swift](https://daveswift.com/structured/)
- Fantastical 3 の**買い切り→サブスク移行**（2020）に日本でも反発があった（「無意味なサブスクリプション」等） — [ソフトアンテナ](https://softantenna.com/blog/fantastical-3-subscription/)、[portal shit!](https://portalshit.net/2020/02/20/a-meaningless-subscription-model)
- Sorted³＝Apple 専用（Android/Windows 無し）、高度なプロジェクト管理・外部連携は弱い — [Akiflow: Google Calendar vs Sorted 3](https://akiflow.com/blog/googlecalendar-vs-sorted-3/)

### Inferences
- コマの「時刻付き記録だけを Google カレンダーへ書く（アプリ→カレンダー）」は、Structured が出来ずに要望されている方向。書き戻しは「終日イベント」ではなく時刻付きイベントとしてのみ行い、枡だけの記録は書かない方針が、既存アプリの終日扱いの混乱を避けやすい（終日イベントの扱いについての一次資料は今回見つからず、これは推測）。
- 双方向同期は高額サブスク勢の売りだが、不満の中心は価格。個人開発のコマは一方向（書き出し）＋読み込み表示で十分差別化できる。

### Gaps
- 各アプリの「終日イベント」を時間帯枡にどう写すか（例: 終日→午前？）の一次資料は見つからなかった。
- Notion Calendar・Amie・Morgen の Google 同期の詳細（双方向か、タスクをイベントとして書くか）は今回未確認。

---

## Q5. Capacitor + iOS: Siri ショートカット／App Intents・ウィジェット・アクションボタン・Watch・HealthKit・背景音声で何ができ、どこから Swift が要るか

### Takeaway
Capacitor（Web 技術を iOS アプリに包む枠組み）から**Shortcuts・ウィジェット・Watch・HealthKit・背景録音**はすべて「コミュニティのプラグイン＋少量の Swift 設定」で届くが、**ウィジェットの見た目・Watch アプリの画面・App Intent（＝Shortcuts に出る「操作」の定義）本体は Swift/SwiftUI で書く**必要がある。JS はアプリが前面に来た後にしか動かないので、「アプリを開かずに裏で JS を実行」はできない。

### Cited Findings
**Siri ショートカット / App Intents**
- `capacitor-plugin-siri-shortcuts`（lovetodream）＝`donate`（Siri に操作を登録）、`present`（Siri に追加する画面）、`delete`、`appLaunchBySiriShortcuts` リスナー。iOS 12+、Capacitor 6 対応版あり。**リポジトリはアーカイブ済み（保守終了）**で、作者は「ネイティブで作ることを勧める」と明記。`Info.plist` の `NSUserActivityTypes` と `AppDelegate.swift` の書き換えが必要 — [GitHub: lovetodream/capacitor-plugin-siri-shortcuts](https://github.com/lovetodream/capacitor-plugin-siri-shortcuts)
- 同プラグインは **Intent の donate（パラメータ付き操作）は非対応**＝Intent ごとに Swift/Obj-C が必要だから、と 2023 年の Issue で説明 — [Issue #53](https://github.com/lovetodream/capacitor-plugin-siri-shortcuts/issues/53)
- Ionic フォーラム（2024-02〜08）＝「Shortcuts の自動化から JS 関数を実行する App Intent」を作りたい質問に、「AppIntent は任意の Swift ファイルに書けばプロジェクトに含まれるだけで登録される」との回答。質問者は結局 **処理を Swift で書いた**（裏で JS を動かす手立ては提示されず） — [Ionic Forum: iOS App Intent + Capacitor](https://forum.ionicframework.com/t/how-to-create-an-ios-app-intent-that-can-execute-a-js-function-be-triggered-by-a-shortcuts-automation/239969)
- 代替経路＝カスタム URL スキーム／Universal Link。Capacitor 標準 `@capacitor/app` の `appUrlOpen` リスナーで受け取れる — [Capacitor Docs: App plugin](https://capacitorjs.com/docs/apis/app)、[Capacitor Docs: Deep Links](https://capacitorjs.com/docs/guides/deep-links)。Shortcuts 側は「URL を開く」操作でアプリを起動しつつ処理を指示できる — [Apple Support: Intro to URL schemes in Shortcuts](https://support.apple.com/guide/shortcuts/intro-to-url-schemes-apd621a1ad7a/ios)
- App Intent からアプリを開く公式の手段は Universal Links — [Apple Forums: OpenURLIntent to custom url scheme](https://developer.apple.com/forums/thread/762586)
- Apple の App Intents＝Siri・Spotlight・Shortcuts・ウィジェット・Apple Intelligence に操作を見せる枠組み。App Shortcuts＝ユーザー設定なしで最初から Shortcuts に出る Intent — [Apple Docs: App Intents](https://developer.apple.com/documentation/appintents)、[App Shortcuts](https://developer.apple.com/documentation/appintents/app-shortcuts)
- 競合の実例＝Structured は最新版で「Siri に頼んでタスク作成・更新」（ネイティブ実装） — [App Store JP: Structured](https://apps.apple.com/jp/app/structured-%E6%AF%8E%E6%97%A5%E3%81%AE%E4%BA%88%E5%AE%9A%E5%B8%B3/id1499198946)

**アクションボタン**
- iPhone 15 Pro 以降のアクションボタンには**任意のショートカット**を割り当てられ、インストール済みの第三者アプリが提供する操作もそこに出る。2つのショートカットを押す回数で切り替える MultiButton のような工夫もある — [MacRumors: Assign Two Functions to the Action Button](https://www.macrumors.com/how-to/iphone-15-pro-assign-two-shortcuts-action-button/)、[Macworld](https://www.macworld.com/article/2953623/unleash-your-iphones-action-button-with-these-7-creative-shortcuts.html)

**ホーム画面・ロック画面ウィジェット（WidgetKit）**
- `capacitor-widget-bridge`（Capacitor 8 対応）＝App Group（＝アプリと拡張が共有する保存領域）の UserDefaults に `setItem/getItem` で書き、`reloadAllTimelines()` でウィジェットを更新。**ウィジェット本体は SwiftUI の Widget Extension として自分で作る**。Android の App Widget も同じ API で扱える — [GitHub: kisimediaDE/capacitor-widget-bridge](https://github.com/kisimediaDE/capacitor-widget-bridge)
- 元になった `capacitor-widgetsbridge-plugin`（0xn33t、iOS のみ、同じ getItem/setItem/reloadAllTimelines） — [GitHub: 0xn33t/capacitor-widgetsbridge-plugin](https://github.com/0xn33t/capacitor-widgetsbridge-plugin)
- `@capgo/capacitor-widget-kit`＝WidgetKit と Live Activities（ロック画面上部・Dynamic Island の実況表示）向け。両ターゲットの Info.plist に App Group を指定 — [GitHub: Cap-go/capacitor-widget-kit](https://github.com/Cap-go/capacitor-widget-kit)
- ロック画面ウィジェット＝WidgetKit の accessory 系ファミリー（accessoryCircular / accessoryRectangular / accessoryInline）、iOS 16 以降、SwiftUI で書き、TimelineProvider（＝いつ何を表示するかの時刻表）でデータを渡す。Apple Watch のコンプリケーション（文字盤の小窓）と同じ仕組み — [Apple Docs: Creating accessory widgets and watch complications](https://developer.apple.com/documentation/widgetkit/creating-accessory-widgets-and-watch-complications)
- 競合の実装＝Structured「インタラクティブ・ウィジェット」（無料機能）、Tiimo＝ホーム・ロック画面ウィジェット＋Live Activities — [App Store JP: Structured](https://apps.apple.com/jp/app/structured-%E6%AF%8E%E6%97%A5%E3%81%AE%E4%BA%88%E5%AE%9A%E5%B8%B3/id1499198946)、[Tiimo 公式](https://www.tiimoapp.com/)

**Apple Watch**
- `@capacitor/watch`（Ionic 公式、実験的）＝Watch の UI を **Web 側のコードで定義して**ペアリングした Watch に表示。iOS のみ。`AppDelegate.swift` に `import WatchConnectivity` と `import CapacitorWatch` を追加。実機の Watch が必要（シミュレータ不可） — [npm: @capacitor/watch](https://www.npmjs.com/package/@capacitor/watch)、[GitHub: ionic-team/CapacitorWatch](https://github.com/ionic-team/CapacitorWatch)
- `@capgo/capacitor-watch`＝WatchConnectivity（iPhone↔Watch の通信枠組み）の `sendMessage`（Watch が到達可能な時の即時メッセージ）と `updateApplicationContext`（最新状態を1つだけ保持して同期）を JS から呼ぶ。Watch アプリ本体は別途ネイティブ — [GitHub: Cap-go/capacitor-watch](https://github.com/Cap-go/capacitor-watch)

**HealthKit**
- `@capgo/capacitor-health`＝Apple HealthKit と Android Health Connect、歩数・距離・消費カロリー・心拍・体重など、iOS 14+。2025-08 更新、保守者1名 — [GitHub: Cap-go/capacitor-health](https://github.com/Cap-go/capacitor-health)、[Socket: capacitor-health](https://socket.dev/npm/package/capacitor-health)
- 旧 `capacitor-healthkit`（perfood）は 0.2.1 が**4年前**で止まっている — [npm: capacitor-healthkit](https://www.npmjs.com/package/capacitor-healthkit)

**背景での音声（録音・再生）**
- `@capgo/capacitor-audio-recorder`＝iOS/Android で録音、**Xcode の Background Modes → Audio（Info.plist の `UIBackgroundModes` に `audio`）を自分で有効化**すれば画面ロック中も録音が続く — [GitHub: Cap-go/capacitor-audio-recorder](https://github.com/Cap-go/capacitor-audio-recorder)
- Capawesome の Audio Recorder も同じ設定（Background Modes: Audio, AirPlay, PiP） — [Capawesome: Audio Recorder](https://capawesome.io/docs/plugins/audio-recorder/)、[Capawesome: 背景で音を再生する方法](https://capawesome.io/blog/how-to-play-audio-in-the-background-in-capacitor/)

### Inferences
- コマの最小構成＝「App Intent は Swift で1つ（例: 『今の枡に記録』）を書き、中身は App Group の共有領域に JSON を書く → アプリ起動時に Capacitor 側が読む」。JS を裏で動かす前提を捨てれば Shortcuts・アクションボタン・ウィジェットが同じ共有領域で揃う。
- ウィジェットは「今日の4枡と今の枡」を SwiftUI で描くだけの小さな拡張で済み、データは JS から `setItem` で流し込める（capacitor-widget-bridge の型）。
- Watch は「音声入力の入口」に絞るなら `@capgo/capacitor-watch` のメッセージ通信で足りるが、Watch 側の画面は SwiftUI が必要。

### Gaps
- `@capacitor/watch` の公式ドキュメント（capacitorjs.com/docs/apis/watch）は取得時に 404 で、現在の保守状況・Capacitor 8 対応は未確認。
- App Intents を Capacitor アプリに組み込んだ**公開済みの実装例**（GitHub リポジトリ）は見つからなかった。
- 背景で**音声認識**（録音ではなく文字起こし）を続けられるかは資料が無い（SFSpeechRecognizer は前面利用が前提と考えられるが未確認）。

---

## Q6. 音声入力: WKWebView（Capacitor が使う内蔵ブラウザ）の Web Speech API と、ネイティブ音声認識プラグイン、ja-JP の品質

### Takeaway
WKWebView でも `webkitSpeechRecognition` は露出しているが、**アプリの Info.plist に `NSSpeechRecognitionUsageDescription` を入れないと動かない**（無いと `service-not-allowed`）。それでも interimResults（途中結果）の挙動が不安定という報告があり、実務では `@capacitor-community/speech-recognition` か `@capgo/capacitor-speech-recognition`（iOS 26 の SpeechAnalyzer にも対応）を使うのが安全。日本語は Apple の端末内認識・SpeechAnalyzer とも対応言語に含まれる。

### Cited Findings
- WebKit Bug 239816（2022-04 報告、同年 8 月 WORKSFORME で終了）＝WKWebView では `webkitSpeechRecognition` が window にあるのに許可ダイアログが出ない。原因はアプリ側が **`NSSpeechRecognitionUsageDescription` を Info.plist に持っていない**こと。無いと `service-not-allowed` エラー — [WebKit Bugzilla 239816](https://bugs.webkit.org/show_bug.cgi?id=239816)
- iOS Safari/WebKit で `continuous = true`, `interimResults = true` にしても interimResults が期待通り動かないことがある（Apple 開発者フォーラム） — [Apple Forums 775699](https://developer.apple.com/forums/thread/775699)
- 「WKWebView の webkitSpeechRecognition は SFSpeechRecognizer を使っているのか」という質問（2024-01）は**回答ゼロ** — [Apple Forums 744056](https://developer.apple.com/forums/thread/744056)
- Can I WebView の機能表に Speech recognition の項目あり（WebView 別対応表） — [caniwebview: speech-recognition](https://caniwebview.com/features/web-feature-speech-recognition/)
- `@capacitor-community/speech-recognition`＝`start({ language: "ja-JP" 等, maxResults, prompt, partialResults })`。`partialResults: true` にすると `partialResults` イベントで途中結果が流れる — [npm: @capacitor-community/speech-recognition](https://www.npmjs.com/package/@capacitor-community/speech-recognition)、[GitHub](https://github.com/capacitor-community/speech-recognition)
- `@capgo/capacitor-speech-recognition`＝iOS は既定で SFSpeechRecognizer、`useOnDeviceRecognition: true` かつ `isOnDeviceRecognitionAvailable()` が真なら **iOS 26 の SpeechAnalyzer** 経路を使う — [npm: @capgo/capacitor-speech-recognition](https://www.npmjs.com/package/@capgo/capacitor-speech-recognition)
- SpeechAnalyzer（iOS 26、WWDC25）＝SFSpeechRecognizer（iOS 10〜）の後継、端末内処理、初期対応言語に **日本語** を含む（広東語・中国語・英語・仏・独・伊・日・韓・葡・西） — [WWDC25: Bring advanced speech-to-text to your app with SpeechAnalyzer](https://developer.apple.com/videos/play/wwdc2025/277/)、[Addpipe: SpeechAnalyzer API](https://blog.addpipe.com/apple-speechanalyzer-api/)
- SpeechAnalyzer の DictationTranscriber は iOS 10 の端末内 SFSpeechRecognizer と同じ言語・モデル・端末を支える — [Anton Gubarenko: iOS 26 SpeechAnalyzer Guide](https://antongubarenko.substack.com/p/ios-26-speechanalyzer-guide)
- 競合＝Structured は「AI ディクテーション（話した内容をタスクに変換）」を売りにしている — [Dave Swift](https://daveswift.com/structured/)

### Inferences
- WebKit のバグ票が「Speech framework の許可キーが必要」と結論づけたことから、WKWebView の Web Speech 実装は **Apple の Speech framework（SFSpeechRecognizer）を下で使っている**と読める（Apple の明言は無し）。つまり品質はネイティブと同等で、差は「途中結果・連続認識の制御」と「エラー処理の細かさ」。
- コマは「短い一言を枡に落とす」用途なので、途中結果の不安定さは致命的ではないが、「話し終わりの検出」「無音停止」を自分で制御したいならネイティブプラグインの方が扱いやすい。

### Gaps
- **ja-JP の認識品質**（WKWebView vs ネイティブ、Whisper 等との比較）を数値で示す資料は見つからなかった。
- Web Speech API が WKWebView で iOS 17/18/26 の各版でどう変わったかの WebKit リリースノート記載は確認できなかった。

---

## Q7. App Store 審査: BYOK（利用者が自分の OpenAI/Anthropic キーを入れる）は許されるか、IAP の要件、TestFlight/Codemagic

### Takeaway
Apple のガイドラインに「BYOK 禁止」の条文は見当たらず、Pal Chat・OpenCat・Geeps・OwnKey・Wallai など**BYOK を名乗るアプリが App Store に多数並んでいる**のが実例。2025-11-13 の改定で **5.1.2(i)「個人データを第三者 AI と共有する前に、明示して同意を得る」** が追加されたので、アプリ内でその旨のダイアログが必要。機能解錠は IAP 必須（3.1.1）。Mac 無しでも Codemagic の無料枠（月 500 分）で TestFlight へ上げられる。

### Cited Findings
**BYOK の実例（App Store 掲載中）**
- Pal Chat - AI Chat Client（画像入力、GPT-Image/Stable Diffusion/Flux、履歴は端末内、system message と temperature を編集、利用制限なし） — [App Store: Pal Chat](https://apps.apple.com/qa/app/pal-chat-ai-chat-client/id6447545085?l=ar)
- Geeps: AI Chat BYOK（OpenAI・Anthropic・Google・OpenRouter 互換 API、自分のキー） — [App Store: Geeps](https://apps.apple.com/us/app/geeps-ai-chat-byok/id6476961115)
- OpenCat - AI Chat, Agent, MCP（BYOK 対応） — [App Store: OpenCat](https://apps.apple.com/us/app/opencat-ai-chat-agent-mcp/id6445999201)
- OwnKey: 12+ AI Tools BYOK App、Wallai Chat（Ollama/Claude/ChatGPT/Gemini/Grok） — [App Store: OwnKey](https://apps.apple.com/us/app/ownkey-12-ai-tools-byok-app/id6751444579)、[App Store: Wallai](https://apps.apple.com/ca/app/wallai-chat/id6756409104)
- BYOK アプリの一覧サイトがある — [BYOKList](https://byoklist.com/)
- OpenAI 側は BYOK 方式を「許容」と開発者コミュニティで回答（一次資料はフォーラム投稿） — [OpenAI Community: Bring Your Own Key policy](https://community.openai.com/t/bring-your-own-key-policy/446168)

**Apple 側のルール**
- 2025-11-13 改定＝5.1.2(i) に「個人データを**第三者 AI を含む**第三者と共有する場所を明示し、事前に明示的許可を得る」が追加。プライバシーポリシーのリンクだけでなくアプリ内の表示で同意を取る必要 — [TechCrunch 2025-11-13](https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai)、[Apple Developer News: Updated App Review Guidelines](https://developer.apple.com/news/?id=ey6d8onl)、[DEV: Apple's Guideline 5.1.2(i)](https://dev.to/arshtechpro/apples-guideline-512i-the-ai-data-sharing-rule-that-will-impact-every-ios-developer-1b0p)
- 3.1.1＝アプリ内で機能を解錠するには IAP（App 内課金）を使う。ライセンスキー・QR コード等の独自解錠は不可 — [RevenueCat: Ultimate guide to App Store rejections](https://www.revenuecat.com/blog/growth/the-ultimate-guide-to-app-store-rejections)
- 3.1.3(b)＝他プラットフォームで買った購読は iOS アプリ内でも使わせてよい — 同上 [RevenueCat](https://www.revenuecat.com/blog/growth/the-ultimate-guide-to-app-store-rejections)
- 5.1.1(v)＝アカウント削除の導線は**アプリ内**に必要（メールや Web フォームでは不可） — 同上
- OpenAI の API キーをクライアント（ブラウザ・モバイル）に埋め込むと盗まれる、自前サーバ経由を推奨（開発者自身のキーを配る場合の話） — [OpenAI Help: API Key Safety](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety)

**TestFlight / Codemagic**
- Codemagic 個人アカウント＝**macOS M2 で月 500 分無料**（毎月1日リセット）、超過は $0.095/分。チームでは無料枠なし — [Codemagic Docs: Pricing](https://docs.codemagic.io/billing/pricing/)
- Codemagic の Capacitor 用手順あり。App Store Connect API キーで署名・TestFlight 配信を自動化 — [Codemagic Docs: Ionic Capacitor apps](https://docs.codemagic.io/yaml-quick-start/building-an-ionic-app/)、[Capgo: Automatic Capacitor iOS build with Codemagic](https://capgo.app/blog/automatic-capacitor-ios-build-codemagic/)
- Mac 無しでの iOS ビルドは可能だが、シミュレータでの対話デバッグは実機 Mac が要る — [Capawesome: Build and Deploy iOS Apps Without a Mac](https://capawesome.io/blog/how-to-build-and-deploy-ios-apps-without-a-mac/)、[Medium: Build iOS from Windows with Codemagic](https://medium.com/@varuntej07/how-i-managed-to-build-an-ios-app-from-windows-using-codemagic-ff2f92d66580)
- 2025-07 に Ionic Appflow から Codemagic に移った事例記事 — [Montana Banana](https://montanab.com/2025/07/moving-from-ionic-appflow-to-codemagic/)

### Inferences
- BYOK は「機能の解錠」ではなく「利用者が自分の外部サービス設定を入れる」だけなので 3.1.1 には当たらないと読める（実例の多さが裏付け）。ただしコマが**自前のキーで AI を提供して料金を取る**なら IAP が必要。
- コマの音声→記録で LLM を呼ぶなら、初回に「入力内容が OpenAI/Anthropic に送られる」と明示する同意画面（5.1.2(i)）を1枚用意する。
- キーは Keychain（iOS の暗号化保存領域）に置き、ログや同期に混ぜない設計が審査・安全の両面で無難（一次資料は OpenAI の安全指針）。

### Gaps
- Apple が BYOK について**明文で判断した**事例（却下・承認の理由文）は見つからなかった。
- Anthropic 側の BYOK 許容方針の一次資料は今回確認できなかった。

---

## Q8. 日本の App Store における個人開発・生産性アプリの価格の相場（買い切り vs サブスク、円の実例）

### Takeaway
日本の App Store では、**買い切りは ¥1,500〜¥5,000**（Things 3 iPhone ¥1,500、Sorted³ iOS Pro ¥2,500、たすくま ¥5,000）、**サブスクは年額 ¥3,000〜¥10,000**（Structured 年 ¥1,500〜2,990、Tiimo 年 ¥6,000 前後、Todoist Pro 年 ¥10,080）が実例の帯。Lifetime（生涯解錠）は年額の 3〜5 倍（Structured ¥9,990、Tiimo ¥27,800）。

### Cited Findings
- Things 3（iPhone）＝**¥1,500 買い切り**、IAP なし、iOS 16.4+、Mac/iPad は別売 — [App Store JP: Things 3](https://apps.apple.com/jp/app/things-3/id904237743)、[Handle: Things3 解説](https://allout-appreview.com/2025/06/19/things-3/)。（※ある比較記事の「iPhone 版約 7,000 円・Mac 版約 14,000 円」は App Store 表示と一致せず誤り） — [AI経営総合研究所](https://ai-keiei.shift-ai.co.jp/task-apps-recommend-2025/)
- Sorted³＝無料＋**iOS PRO ¥2,500 買い切り**、macOS PRO ¥4,000、iOS+macOS バンドル ¥6,000、応援課金（Soda ¥300 / Pizza ¥1,500）、学生向け ¥5,000 バンドル。iOS 15.6+。最新 3.15 は 2024-10 — [App Store JP: Sorted³](https://apps.apple.com/jp/app/sorted-%E3%82%AB%E3%83%AC%E3%83%B3%E3%83%80%E3%83%BC-%E3%83%8E%E3%83%BC%E3%83%88-%E3%82%B9%E3%82%AF/id1306893526)。米国は iOS PRO $14.99 / macOS $24.99 — [Sorted³ 公式](https://www.sortedapp.com/)
- たすくま＝**¥5,000 買い切り**（IAP なし）、iOS 17+、2025-10 更新、評価 3.9（161件） — [App Store JP: Taskuma](https://apps.apple.com/jp/app/taskuma-taskchute-for-iphone/id896335635)。過去記事では ¥3,000（2014）→ ¥3,600 と値上げの経緯 — [ラフハックス 2014](http://noryhana.net/2014/08/02/app-taskuma/)、[appleshinja](https://appleshinja.com/taskuma-review)
- Structured＝無料＋Pro。日本語 App Store の IAP 一覧＝月 ¥400 / ¥990、年 ¥1,500 / ¥2,690 / ¥2,990、**Lifetime ¥9,990**（複数価格は地域・割引の段階）。iOS 18+ — [App Store JP: Structured](https://apps.apple.com/jp/app/structured-%E6%AF%8E%E6%97%A5%E3%81%AE%E4%BA%88%E5%AE%9A%E5%B8%B3/id1499198946)。別ブログ（2025-11）では月 ¥200／年 ¥1,100／買い切り ¥4,800 と記載され**食い違う** — [スーログ](https://blog.skeg.jp/archives/2025/11/structured-ipad-best-app-2025.html)。公式は「価格は地域の購買力で変える」と明記 — [Structured Help: Upgrade to Pro](https://help.structured.app/en/articles/331330)
- Tiimo＝日本語 App Store の IAP 一覧に Pro ¥1,200 / ¥1,500 / ¥1,800 / ¥2,500 / ¥2,800 / ¥4,800 / ¥6,000、**Lifetime ¥27,800**。iOS 18+ — [App Store JP: Tiimo](https://apps.apple.com/jp/app/tiimo-%E3%83%86%E3%82%A3%E3%83%BC%E3%83%A2-%E3%82%B9%E3%82%B9%E3%82%AF%E7%AE%A1%E7%90%86%E3%82%92%E7%BF%92%E6%85%A3%E5%8C%96-adhd%E5%AF%BE%E7%AD%96-%E9%9B%86%E4%B8%AD/id1480220328)。日本語ブログでは「年約 ¥8,000 か買い切り約 ¥10,000、初年度約 ¥2,500 のキャンペーン」 — [note: Tiimo](https://note.com/yuruyuura/n/n2276f4e3d022)、旧価格「月 ¥480／年 ¥2,800」 — [AIzineen](https://www.aizineen.tech/tiimo/)。要望板は「Lifetime は戻さない」 — [Tiimo Feedback](https://tiimo.nolt.io/127)（App Store 一覧と矛盾＝キャンペーンや地域差の可能性）
- Todoist Pro＝2025-12-10 から **月払い ¥588→¥1,118、年払い ¥5,856→¥10,080（月 ¥840 相当）** — [Todoist ヘルプ: 料金とプランの改訂 2025](https://www.todoist.com/ja/help/articles/todoist-pricing-and-plans-update-2025-everything-you-need-to-know-Tn6Pg1JKI)、[Todoist プロ プラン：料金改定](https://www.todoist.com/ja/help/articles/todoist-pro-plan-pricing-update-bxBvHZuJZ)
- Fantastical 3（2020 のサブスク移行時）＝月 ¥610 または年払いで月 ¥408 相当 — [webrandum: Fantastical 3](https://webrandum.net/fantastical3/)。別資料は月 ¥550／年 ¥4,300 — [とむのブログ 2022](https://tomunoblog.com/2022/04/15/fantastical/)。現在の米国は $4.75/月（年払い） — [Morgen: Fantastical pricing](https://www.morgen.so/blog-posts/fantastical-pricing)
- Apple は 2022-10 に日本の App Store 価格を改定し、2023 年に価格段階（価格ティア）の選択肢を大幅に増やした — [ケータイ Watch](https://k-tai.watch.impress.co.jp/docs/column/value/1465359.html)、[Qiita: App内課金の価格リスト](https://qiita.com/shintsu/items/ca09d6ce831fcb9ce7b4)
- 個人開発者の設計議論の例＝「月額・年額・買い切り＋無料プラン広告」の組み合わせを検討する Issue — [GitHub: atani/leafmark-app Issue #3](https://github.com/atani/leafmark-app/issues/3)
- Apple 標準リマインダーは iOS 26 で機能が拡張され、無料で基本機能を網羅している（競合の下限が「無料」） — [スーツアップ: iPhone タスク管理](https://suitup.jp/blog/25042/)

### Inferences
- 個人開発の日本語プランナーとして違和感の無い帯は「無料＋買い切り ¥1,500〜3,000」または「年 ¥1,500〜3,000＋Lifetime ¥5,000〜10,000」。¥5,000 買い切り（たすくま）は「TaskChute 流派」の熱心な層があってこそ成り立っている。
- Fantastical・Todoist の値上げ／サブスク化への反発が日本でも記事になるので、**買い切りか Lifetime の選択肢がある**ことは、個人開発アプリの好感度に効く。
- 価格は Apple が地域別に自動換算するため、¥ 表示は USD 基準（例 $9.99≒¥1,500、$14.99≒¥2,500）から逆算するのが実務的。

### Gaps
- 日本の個人開発生産性アプリの**売上分布**（何%が買い切りか等）の統計は見つからなかった。
- TickTick Premium・Routinery の**円建て**価格は未確認（USD/EUR/NT$ のみ）。
- Structured・Tiimo の IAP 一覧に複数の年額・月額が並ぶ理由（地域割引か旧価格か）は App Store 表示だけでは判別できない。
