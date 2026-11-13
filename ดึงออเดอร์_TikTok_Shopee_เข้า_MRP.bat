@echo off
chcp 65001 >nul
title QueenCosy MRP - ดึงออเดอร์สด TikTok & Shopee อัตโนมัติ
cd /d "%~dp0"
node sync-orders-from-chrome.js
echo.
pause
