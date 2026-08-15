@echo off
chcp 65001 > nul
title Arknights Chibi Spine Hub
echo ============================================================
echo   ARKNIGHTS CHIBI SPINE HUB · 454+ OPERATORS
echo   Author: FIRaci / DeepMind Antigravity
echo ============================================================
echo.
echo [*] Đang khởi động máy chủ cục bộ...
start "" http://localhost:8080/web/index.html
python server.py
pause
