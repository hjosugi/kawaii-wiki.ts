<!-- i18n: language-switcher -->
[English](UPGRADING.md) | [日本語](UPGRADING.ja.md)

# アップグレードとロールバック

## アップグレード前に

1. `CHANGELOG.md` を読み、対象のイメージタグを確認します。
2. 以下の手順から稼働中のプライマリデータベースとアセットストレージに対応するバックアップを取得し、復元テストを行います。
3. 追加のアプリケーションインスタンスを停止し、起動マイグレーションを実行するプロセスが1つだけになるようにします。
4. 同じ永続的な `/data` ボリュームを使って新しいイメージをプルし、起動します。
5. データベースクエリを実行する `/api/health` を確認し、ログイン、ページ閲覧、アセット、検索を検証します。管理画面のバックエンド表示で、使用中のデータベース、検索インデックス、リトライ残数、アセットバックエンドも確認します。

スキーママイグレーションは起動時に自動実行され、選択したドライバに対して検証されます。down migration は前提にせず、データベースのロールバックはバックアップ復元で行ってください。組み込み検索とElasticsearchはいずれも派生データであり、プライマリデータベースから再構築できます。

## バックアップと復元の一覧

データベースとアセットは同じメンテナンス時間帯にバックアップしてください。GitコンテンツミラーやElasticsearchスナップショットだけではWiki全体を復元できません。

### SQLite とローカル libSQL

SQLiteはオンラインバックアップを作成し、ローカルアセットもコピーします。

```bash
sqlite3 /data/ts-wiki.sqlite ".backup '/backups/kawaii-wiki.sqlite'"
rsync -a /data/assets/ /backups/assets/
```

ローカルlibSQLファイルは、全アプリケーションインスタンスを停止してからデータベースファイルと隣接するWAL/SHMファイルをコピーします。空のデータディレクトリへ元の権限のまま復元し、バックアップ作成時と同じイメージと設定で起動してください。

remote libSQL/Turso はプロバイダーのバックアップ、ポイントインタイムリカバリ、またはexport機能を使用します。`LIBSQL_REPLICA_PATH` とその `.bus-reader` ファイルはキャッシュであり、正本のバックアップではありません。

### PostgreSQL

マネージドスナップショット、または認証情報をservice file/シークレット注入で渡した `pg_dump --format=custom` を使用します。別の空データベースへの `pg_restore` をテストしてください。dump、正確なイメージタグ、シークレットを除いた設定を同じ復旧記録に残します。

### MySQL/MariaDB

マネージドスナップショット、または `--defaults-extra-file`/基盤のシークレットストアから認証情報を渡した `mysqldump --single-transaction --routines --triggers` を使用します。別の空データベースへの復元をテストしてください。

### ローカルアセットとR2

ローカルアセットは `DATA_DIR/assets` にあり、データベースと一緒にコピーする必要があります。R2は可能であればバケットのversioning/retentionを有効化し、バケットを別途exportまたはreplicateします。データベースにはアセットのメタデータ、R2には実データがあるため、完全な復元には両方が必要です。

## SQLite から PostgreSQL / MySQL への移行

`db:migrate-to` はSQLiteの全canonical tableを**新規の空**PostgreSQL/MySQLデータベースへコピーし、対象の検索インデックスを再構築します。`--verify` はテーブルごとの件数とchecksumを比較します。ローカル/R2のアセット実データはコピーしません。

1. 全アプリケーションインスタンスを停止し、SQLiteとアセットをバックアップします。
2. 空の対象データベースと、最小権限のアプリケーションアカウントを作成します。
3. メンテナンス用シェルで対象の `DATABASE_DRIVER`、`DATABASE_URL`、`DATABASE_SSL`、必要に応じて `DATABASE_POOL_MAX` を設定します。
4. dry-run、apply、verifyの順に実行します。

```bash
bun run db:migrate-to --to postgres --from /data/ts-wiki.sqlite --dry-run
bun run db:migrate-to --to postgres --from /data/ts-wiki.sqlite
bun run db:migrate-to --to postgres --from /data/ts-wiki.sqlite --verify
```

MySQL/MariaDBの場合は `DATABASE_DRIVER=mysql` と `--to mysql` を使用します。applyは空でない対象を拒否します。verify後、まず1つのアプリケーションインスタンスだけを対象DBで起動し、health/auth/pages/assets/searchを確認してから通常のインスタンス数へ戻します。

PostgreSQL ↔ MySQL または SQLite/libSQL への自動逆移行はありません。remote libSQLから移行する場合は、プロバイダー機能で検証済みのSQLite互換ファイルへexportしてからこのコマンドを使用します。新バックエンドのbackup/restore drillが完了するまで旧データベースはread-onlyのまま保持してください。

## 検索バックエンドの切り替え

Elasticsearchを有効にする場合は、プライマリDBをバックアップし、`SEARCH_BACKEND` と `ELASTICSEARCH_*` を設定して再起動後、管理画面から検索を再構築します。再構築はバージョン付きインデックスを作成してlive aliasを原子的に切り替えます。切り替え完了前にpending/dead-letter outbox件数を確認してください。

組み込み検索へ戻す場合は `SEARCH_BACKEND=fts5` にして再起動し、管理画面から使用中の組み込みインデックスを再構築します。検索結果とACLを確認してからElasticsearchを削除できます。Elasticsearch停止中もデータベース書き込みが正本です。

## シークレットの扱い

- `DATABASE_URL`、`LIBSQL_AUTH_TOKEN`、`ELASTICSEARCH_*`、`R2_*`、`JWT_SECRET` は基盤のシークレットマネージャーまたはマウントしたシークレットファイルに保存します。実値をGit、管理画面の設定テンプレート、shell history、Issueログへ入れないでください。
- リモートサービスはTLSを使い、アプリケーションDB/schema、Elasticsearchのindex prefix、R2 bucketだけに権限を限定します。
- 漏えいの疑いがある場合と旧バックエンド削除前に認証情報をrotateします。バックアップは暗号化し、復元権限を制限してください。

## ロールバック

アプリケーションのロールバックは**復元ベース**です：新しいイメージを停止し、アップグレード前のデータベースとアセットを復元してから、以前のイミュータブルなイメージタグを起動します。
より新しいメジャーまたはマイナーリリースでマイグレーションされたデータベースに対して、古いイメージを使用しないでください。ただし、その変更履歴に明示的にサポートされていると記載がある場合は例外です。

アップグレード後の通常のトラフィックを通過し、新しいアップグレード後のバックアップが完了するまで、古いイメージとバックアップは保持してください。

データベース切り替えでは、旧DBがread-onlyのままの場合に限り環境変数を戻すだけで安全に戻せます。新DBが書き込みを受け付けた後はトラフィックを停止し、整合したバックアップを復元してください。内容が分岐したDBを交互に使用してはいけません。検索バックエンドのロールバックはページデータを戻しませんが、再起動後に選択した検索インデックスの再構築が必要です。

リポジトリのComposeセットアップの場合：

```bash
docker compose pull
docker compose up -d
```

デフォルトの `:1` タグは互換性のある1.xリリースに従います。
すべての更新を手動で承認する必要がある場合は、`KAWAII_WIKI_VERSION` を正確なバージョンに設定してください。
更新中に `docker compose down -v` を実行しないでください。`-v` はwikiのデータボリュームを削除します。
