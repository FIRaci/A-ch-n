@echo off
chcp 65001 > nul
title Arknights Chibi & Dormitory Hub
echo ============================================================
echo   ARKNIGHTS CHIBI SPIDER & 2.5D DORMITORY GAME
echo   Author: FIRaci / DeepMind Antigravity
echo ============================================================
echo.
echo [*] Đang khởi động máy chủ cục bộ...
start "" http://localhost:8080/web/index2.html
python server.py
pause
