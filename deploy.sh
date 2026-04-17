#!/usr/bin/env bash
# 在群晖上运行，用于更新 surge-dashboard 容器
# 使用：bash /volume3/Files/Docker/surge-dashboard/update.sh

COMPOSE_DIR="/volume3/Files/Docker/surge-dashboard"

cd "$COMPOSE_DIR"

echo ">>> 拉取最新镜像..."
docker compose pull

echo ">>> 重启容器..."
docker compose up -d

echo ">>> 清理旧镜像..."
docker image prune -f

echo ">>> 完成！当前状态："
docker compose ps
