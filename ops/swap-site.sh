#!/usr/bin/env bash
# Заменяет боевой сайт (site/) новым дизайном из opus5-site-mock/.
#
# Зачем скрипт, а не «скопируй руками»: у нового дизайна другой набор файлов
# (core.css, land.css, depth.js, hero-webgl.js), а у старого остаётся лишний
# community.css. Если просто копировать сверху, старые файлы останутся лежать
# в папке и уедут на боевой сайт мёртвым грузом. Поэтому папка пересобирается
# с нуля, а картинки-скриншоты дизайна (d1-*.png, m1-*.png) и служебная
# .claude в сайт не попадают — они нужны были только при рисовании макета.
#
# Запуск из корня репозитория:
#   bash ops/swap-site.sh
#
# Сайт после этого можно посмотреть локально:
#   python -m http.server 4173 --directory site
#   http://localhost:4173
#
# Ничего не коммитит и не пушит — это делаете вы сами, когда посмотрите.

set -euo pipefail

SRC="opus5-site-mock"
DST="site"

if [ ! -d "$SRC" ] || [ ! -d "$DST" ]; then
  echo "Запускать из корня репозитория: рядом должны быть папки $SRC и $DST." >&2
  exit 1
fi

# Резервная копия рядом, с датой — на случай «верните как было».
BACKUP="../love-site-backup-$(date +%Y%m%d-%H%M%S)"
cp -r "$DST" "$BACKUP"
echo "Старый сайт сохранён в $BACKUP"

rm -rf "$DST"
mkdir -p "$DST"
cp "$SRC"/*.html "$SRC"/*.css "$SRC"/*.js "$DST"/

echo
echo "Новый сайт собран. Файлы в $DST:"
ls -1 "$DST"

echo
echo "Проверьте локально:"
echo "  python -m http.server 4173 --directory site"
echo "  http://localhost:4173"
echo
echo "Понравилось — коммитьте и пушьте:"
echo "  git add -A site"
echo "  git commit -m \"feat(site): новый дизайн\""
echo "  git push origin main"
